# Deploying Verity

Three pieces: the web app (Vercel), the API plus AI service (one container), and a Postgres database.
Everything below has a free tier. Free-tier rules change, so confirm on each site; **if any sign-up asks for a payment card, stop.**

## Free path (recommended)

### 1. Database: Neon (free Postgres)
1. Sign in at neon.tech with GitHub. Create a project named `verity`.
2. Copy the **connection string** (it starts with `postgresql://` and ends with `?sslmode=require`).

### 2. API + AI service: Render (free web service)
1. Sign in at render.com with GitHub and give it access to the `verity` repo.
2. **New → Blueprint**, pick the repo. Render reads `render.yaml` and creates one service, `verity-api`, from the `Dockerfile`.
3. When asked for values:
   - `DATABASE_URL`: the Neon connection string from step 1.
   - `WEB_ORIGIN`: put the Vercel URL once you have it (step 3); a placeholder is fine for now.
   - `JWT_SECRET` is generated for you. (The API refuses to start in production without a private one.)
4. Wait for the deploy, then open `https://<service>.onrender.com/health/deep`. You want `"api":"up","ai":"up"`.
   If you see a Postgres SSL error in the logs, add the variable `PGSSL=1`.

The AI service runs inside the same container on localhost, so there is no second service and no shared secret to configure.

### 3. Web: Vercel
1. Import the repo, **Root Directory** `web` (framework Next.js).
2. Environment variable `NEXT_PUBLIC_API_URL` = the Render URL (no trailing slash). Set it **before** the build; it is baked in at build time.
3. In Vercel, project settings → Deployment Protection → turn **Vercel Authentication off**, or judges will be asked to log in.
4. Back in Render, set `WEB_ORIGIN` to the exact Vercel URL (no trailing slash) and let it redeploy.

### 4. Verify
Open the Vercel URL: both badges show `up`, **Start judge walkthrough** opens the guideline page. Then run `docs/QA_SCRIPT.md`.

### 5. Free-tier behaviour to expect
- Free web services sleep when idle, so the first visit after a quiet period can take about a minute. Set the GitHub repository variables `WEB_URL` and `API_URL` (Settings → Secrets and variables → Actions → Variables); `.github/workflows/keepalive.yml` then pings both every 10 minutes. GitHub's scheduler is not exact, so occasional cold starts can still happen.
- Free Postgres databases have size and compute limits and may suspend when idle (they wake on the next query).
- The landing page shows a "Waking up the server" message while the API starts and signs visitors in automatically once it answers; `cd web && npm run waking` tests this with a simulated sleeping server.
- Do an idle-for-an-hour test before submitting.
- **Round 3 upgrade.** On the first start after deploying Round 3, the API applies migrations 005 to 008 by itself and seeds, once, the Northwind brand, brand memberships, each brand's logos and palette, and the ten-week team history that the Drift page uses. Nothing needs to be run by hand. Existing reviews and the audit chain are untouched.
- **Memory.** The free web service has 512 MB. The API, the AI service and one image check at a time fit: analysing a large image peaked at about 210 MB for the Python process on a laptop (images are shrunk to 1200 px first). If the service is restarted for lack of memory, lower `WORK_LONG_SIDE` in `ai/app/visual/agent.py`.
- The Docker image now installs Pillow, NumPy and OpenCV (headless) from `ai/requirements.txt`; the first build takes longer.

## Fallback if the Render service is suspended (untested here)
If Render suspends the free service and you cannot resume it, the same Docker image can run on a Hugging Face **Space**, which is free and needs no card. This has not been tried from this repository, so check each step.
1. Create a Space at huggingface.co/new-space: SDK **Docker**, template **Blank**, visibility **Public**.
2. In the Space's Settings, add Variables and Secrets: `PORT=7860`, `WEB_ORIGIN` (the exact Vercel URL, no trailing slash), `JWT_SECRET` (any long random string), `DATABASE_URL` (the Neon connection string) and `PGSSL=1`.
3. Put the repository in the Space. In a **copy** of the repo (so GitHub's README is not changed), add this front matter at the very top of `README.md`, commit, and push that copy to the Space's git address (Hugging Face asks for your access token in the terminal; never paste it into chat or into a file):
   ```
   ---
   title: Verity API
   sdk: docker
   app_port: 7860
   ---
   ```
4. When the Space shows Running, open `https://<your-user>-<space-name>.hf.space/health/deep`: both services should be `up`.
5. In Vercel, set `NEXT_PUBLIC_API_URL` to that address and redeploy the web app (it is baked in at build time). Update the links in the README and the submission text.
Spaces also sleep when idle, so the landing page's "Waking up the server" message still applies.

## Optional: Anthropic key
Without `ANTHROPIC_API_KEY` and `MODEL_FAST`, ToneGuard runs in labelled basic mode and costs nothing. If you add a key, set a spend cap in the Anthropic console first.

## Alternative: Railway (trial credit, then paid)
Two services from the same repo with Root Directory `api` and `ai` (each has a `railway.json`), plus a Railway PostgreSQL plugin.
Variables on the API: `JWT_SECRET`, `AI_SERVICE_URL` (the AI service's public URL), `AI_SERVICE_TOKEN` (same value on both services), `DATABASE_URL` (reference the Postgres plugin), `WEB_ORIGIN`.

## Local testing against a real Postgres
`TEST_DATABASE_URL=postgres://user:pass@host:5432/db npm test` in `api/` runs the whole suite against a real server (each test database is isolated in its own schema). Without it, the tests use the in-process Postgres.
