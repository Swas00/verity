# Round 3 security review

## Scope and environment

Reviewed and exercised share links/public reports, image and brand-asset uploads, and brand isolation. All runtime checks targeted a newly created local database, `verity_pg_verification_20261029`, on PostgreSQL 18.4. The supplied Docker option specifies PostgreSQL 16; the local 18.4 server was used instead because Docker was installed but its daemon was not running, so PostgreSQL 16 compatibility was not separately checked. No Neon, production service, or production database was contacted.

The API and AI service ran locally on ports 4000 and 8000. The API used `DATABASE_URL` pointing only to the local test database. Migrations 001–008 applied successfully, and PostgreSQL reported the `brand_assets_kind_check` constraint after migration 008.

## Results

| Area | What was tried | Result |
|---|---|---|
| Share links | Created a link as a manager; fetched a wrong token, an expired token (expired directly in the local test DB), and a revoked token without signing in | All three returned the same `404 {"error":"not_found"}`. A live link returned 200. |
| Rate limit | Made 61 public-report requests in one minute (one live-link request followed by 60 probe requests) | The live request returned 200; among the next 60, 59 returned 404 and one returned 429. |
| Upload validation | Sent non-image bytes, SVG, a 6,000,001-byte file, and PDF bytes named `.png` to both `POST /brand-assets` and `POST /reviews/:id/image` | Non-image, SVG, and PDF returned 400 `unsupported_image`; oversized files returned 413 `file_too_large`. |
| Brand isolation | Sent an authenticated request with an `X-Brand-Id` for a local brand with no membership; requested a Lumina review while selecting Northwind | The unassigned brand returned 403 `brand_forbidden`; the cross-brand review returned 404 `not_found`. |
| API behavior | Checked `/brands`, `/drift`, `/brand-assets`, `/audit/verify`, and paged reviews against real PostgreSQL | Drift showed Social as drifting and Blog, Content, and Email as stable; audit verification returned `{"ok":true,...}`. PostgreSQL bigint IDs appeared as strings. |
| Seed idempotency | Counted reviews, restarted the API against the same database, and counted again | The initial seeded count was 143. After creating two local probe reviews, the count was 145 before and after the confirmed restart. |

All demo accounts are members of both seeded brands, so a separate local brand without a membership was added to exercise the 403 path. The probe brand and probe reviews were created only in the local test database.

## Finding and fix

The first runtime review found that request logging wrote the bearer share token verbatim because the token is part of `/public/report/:token`'s URL path. The affected request returned the report successfully, and the token was visible in the API log output. This could let anyone with access to retained logs reuse a still-active share link.

The logger now records `/public/report/[redacted]` instead of the token-bearing path. A regression test asserts that the path is redacted and the token-like marker is absent from logs. A fresh API process was then exercised with a live share link; its request log contained only the redacted path.

## Commands and run notes

Commands used for the real-PostgreSQL check:

```sh
createdb -h localhost -p 5432 verity_pg_verification_20261029
cd api
npm install
TEST_DATABASE_URL='postgres://localhost:5432/verity_pg_verification_20261029' npm test
cd ../ai
/usr/local/bin/python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
cd ../api
DATABASE_URL='postgres://localhost:5432/verity_pg_verification_20261029' PORT=4000 AI_SERVICE_URL=http://127.0.0.1:8000 node src/index.js
```

The full API suite completed with 106 tests: 102 passed, 4 skipped, 0 failed. It was rerun after the logging fix with the same result. `npm install` reported one high-severity dependency audit item; that dependency finding was not investigated as part of this route-focused review.

Setup failures and corrections:

- Docker could not connect to its daemon (`/Users/ankiii/.docker/run/docker.sock` was absent); testing continued on the separate local PostgreSQL database above.
- The first `npm test` was run from the workspace root and failed with `Error: no test specified`. Running from `api/` before installing there then failed with `ERR_MODULE_NOT_FOUND` for API dependencies. `cd api && npm install` resolved this.
- An initial API restart hit `EADDRINUSE` because the previous Node child process was still listening. That exact process was stopped, port 4000 was confirmed free, and a fresh API process then started successfully. The post-restart review count and log-redaction check were taken from that fresh process.
