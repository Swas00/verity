# Round 3 submission: text for each item

The organisers will share the exact form. These blocks cover every item the Round 3 brief lists: the working link, the repository,
the updated PDF, the completed-improvements list, technical details, testing notes, what changed from the plan, and team contributions.
Every number below is printed by a script in the repository (the command is given). Re-read the "not done" lines before pasting.

## Links
- **Working project:** https://verity-two-delta.vercel.app (click **Start judge walkthrough**; no signup)
- **Source code (public):** https://github.com/Swas00/verity
- **Updated project PDF:** `docs/Verity_Round3_Project.pdf` (upload to Drive, "Anyone with the link" as Viewer, open it in a private window)

## Completed improvements (the three promised in Round 2)
1. **VisualGuard: image and logo compliance.** Upload an image; problems are marked with numbered boxes and the guideline clause: colours outside the palette, a retired logo, an approved logo that is stretched, squashed, recoloured or crowded. Managers keep each brand's logos, retired logos and palette. Same decisions, scoring, approval and audit as text.
2. **Multi-brand workspaces (agency mode).** One person, several brands, a different role in each. A brand switcher changes guidelines, reviews, audit, dashboard, drift and notifications together. Wording from the user's other brands is flagged as "other brand". Read-only, expiring, revocable client report links.
3. **Brand Drift Intelligence.** Per team, violations per 100 words over the last 3 weeks against the team's own first 4 weeks; drifting teams, the clauses most likely to be broken next, trend charts with data tables, a weekly digest and a manager alert.

Also fixed from Round 2: ClaimGuard false positives on "Limited time only" and "best-in-class"; a 2 MB request limit that contradicted the documented 5 MB guideline upload; the queue loading every review at once (now 25 at a time, with title search); no way to share results with a client.

## Test targets and results
| Improvement | Target | Result | How to reproduce |
|---|---|---|---|
| VisualGuard | at least 85% of planted violations found, at most 10% false flags, on 30 images | Held-out set (first run after tuning on a separate dev set; later runs were regression checks that changed nothing): **22 of 22 found, 0 of 8 compliant images flagged**. Stress set (20 harder images, never tuned on): **9 of 15**, 1 of 5 compliant wrongly flagged | `cd ai && .venv/bin/python scripts/visual_eval.py both` and `... stress` |
| Multi-brand | no cross-brand reads or changes; at least 80% of planted cross-brand wording flagged | Every review route called from the other brand answers 404 (the test fails if the brand filter is removed). Wording: **18 of 21 flagged (86%)**, **0 of 18** clean texts flagged | `cd api && node --test test/multibrand.test.js`; `cd ai && .venv/bin/python scripts/contamination_eval.py` |
| Drift | alert within one window (3 weeks) of the drift starting; none on a stable team | 500 held-out simulated series: stable teams alerted **4.6%**; a 2.2x step caught within 3 weeks in **92%** (median delay 1 week); a 4-week ramp 71%; a mild 1.6x step **45%**. Seeded history: Social found, the other three teams stable | `cd api && npm run drift-eval` |

## Technical details
**Stack.** Web: Next.js 14 and React 18 (Vercel). API: Node.js and Express (Render free tier). AI service: Python FastAPI, Pydantic, Pillow, NumPy, OpenCV (headless), in the same container as the API. Database: PostgreSQL with JSONB (Neon free tier; an in-process Postgres for tests). No paid model or API is used anywhere on the live demo.
**Multi-brand.** One middleware resolves the active brand and the user's role in it from `brand_memberships` on every request (`X-Brand-Id`), so existing role checks work unchanged. A brand you do not belong to and a brand that does not exist return the same 403. Each brand has its own hash-chained audit log. The other-brand check compares text with the user's other brands' names, approved terms, claims and tone examples. Client report links store only a SHA-256 hash of the token and return the same 404 for wrong, expired and revoked tokens.
**VisualGuard.** Palette: the image is shrunk, its colours are grouped with k-means in Lab space, and groups covering at least 3% that are far (delta E above 22) from every palette colour are reported with the rectangle where they sit. Logos: template matching on gradient (edge) maps. A coarse search over 22 sizes and 11 stretch factors on a 400 px copy finds the logo and whether a stretched version fits clearly better (distortion); a precise match on an 800 px copy gives the box; a second pass on colour edges finds logos recoloured to the background's lightness. Recolouring is measured per logo colour, and clear space as the share of busy pixels in a margin of 25% of the logo's size. Findings use the existing finding format with a `region`, so scoring, decisions, audit and the approval workflow are unchanged. Memory: a large image peaked at about 210 MB, so images are shrunk to 1200 px and colour maths is float32.
**Drift.** Pure arithmetic on stored reviews. Weekly violation rate per team (pooled by words); baseline = the team's first 4 weeks; a Poisson standard error widened by a dispersion factor measured on the baseline; alert at 3.5 standard errors and at least 1.3 times the baseline. The threshold was chosen on 300 simulated series and measured on 500 others. The weekly digest is stored once per brand and week (`UNIQUE (brand_id, week)`), which is why alerts go out once; it is created on the first view of a new week because the free host has no scheduler.
**Hard parts.** Telling a stretched logo from a logo-shaped coincidence (stretched fits had to score higher than undistorted ones); finding a recoloured logo whose lightness contrast is gone; making the database's bytes survive as real image bytes (PGlite returns a Uint8Array, which Express would have sent as JSON); keeping brand isolation provable (a test calls every review route from the other brand and a deliberate break proves the test can fail); a drift detector that stays quiet on stable teams.

## Testing notes
- **API:** 106 tests, 102 run by default (workflow, roles, validation, security headers, OpenAPI contract, multi-brand isolation, client links, drift, VisualGuard routes); the other 4 need Redis (3) or the real AI service (1, which runs in CI). `cd api && npm test`.
- **AI service:** 127 tests, including colour, palette and logo checks on generated images, other-brand detection, and the VisualGuard acceptance test (held-out, about 2 minutes). `cd ai && .venv/bin/python -m pytest -q`.
- **Web:** 7 unit tests, lint, a production build, and browser suites run in real Chrome: the full journey, an accessibility audit (axe-core, WCAG 2.0/2.1 A and AA plus best practice, light and dark mode, 0 serious or critical violations), keyboard-only runs, narrow-screen checks (320 px), the sleeping-server simulation, multi-brand, drift, image reviews against the real AI service, the queue, and Round 3 keyboard use. All run in GitHub Actions on every push.
- **Spec:** `docs/openapi.yaml` documents every route and a test fails if the code and the spec disagree; it is linted in CI.
- **Evaluation sets:** text agents (30 + 30 annotated texts), contamination (39 texts), images (30 dev + 30 held-out + 20 stress), drift (simulated teams). Held-out and stress sets were not used to tune thresholds, except that the two ClaimGuard patterns fixed in Round 3 were known held-out errors.
- **Bugs found by the new tests while building:** switching brand left the old brand's rows on screen; weeks started on Thursday instead of Monday; images came back as JSON; Express added a text charset to image types; a 2 MB request limit blocked documented uploads; a first-run wrong threshold flagged ordinary plain banners as logos.

## What does not work yet
- ToneGuard on the live demo is rule-based basic mode (no paid model), so subtle voice problems are not caught.
- VisualGuard misses rotated and partly cropped logos and reports a photographic background as off-palette; it recognises the brand's own logo files, not a general sense of "off-brand". The test images are synthetic and drawn from the same logo files, so real designs will score lower.
- Other-brand detection does not catch wording that has no listed term, claim or name (0 of 3 voice-only samples).
- Drift needs about 7 weeks of history per team; mild or slow drifts are caught late or not at all (45% for a mild 1.6x step); the history is simulated and seeded, there is no real team data; the digest is created on first view each week.
- No usability test with people outside the team and no screen-reader test (automated accessibility checks and keyboard-only runs were done).
- The demo is shared: every visitor sees the same reviews, teams and brands. The free host sleeps when idle (the page says so and continues by itself; a free monitor pings it).
- Email notifications are built but off; in-app notifications work.

## Changes from the plan, and why
- VisualGuard uses classical image processing instead of CLIP embeddings: CLIP needs far more memory than the free 512 MB host and a model download. It costs nothing and runs in 1 to 2 seconds per image.
- Drift is measured on violation rates, not tone embeddings (no embedding model on the free host; the embedding experiment in Round 2 did not help).
- S3 is not used; logos and reviewed images are stored in PostgreSQL.
- The weekly digest is created on first view of a new week because there is no scheduler on the free host.
- Teams are a field on a person's brand membership, not an organisation chart.

## Team contributions (as the repository shows them)
| Name | Round 3 contribution |
|---|---|
| Swastik Sahu | Project lead and integration; Round 3 design and build of all three improvements (API, AI service, web, tests, evaluation, docs, CI), built with AI assistance from Claude (see the README disclosure) |
| Akriti Tigga | Ran the whole API test suite on a real PostgreSQL 18.4 (102 passed, 0 failed), started the server on it and checked the Round 3 routes, the seeds and the audit chain, wrote a security review of the share links, uploads and brand isolation (docs/SECURITY_REVIEW.md), found that share-link tokens were being written to the request log, and fixed it with a regression test (PR #3) |
| Gayathri VS | |
| Sakshi Kumari | |
| Shivam Agarwal | |

Fill a row only from work that is merged in the repository. Rows from Round 2 (Gayathri: accessible reason dialog; Shivam: optional BullMQ and Redis queue, queue tests and CI jobs) are in the README team table.
