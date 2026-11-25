# Sparrow

Sparrow helps high school students find extracurriculars that fit, explore colleges with official data, and keep every application moving.

- Live site: https://newsparrow.vercel.app/
- publik listing: https://publikhq.com/newsparrow

## What's in the app

- **Landing, Privacy, Terms and Support pages.** Static and fast, with a procedural WebGL glass-sculpture hero.
- **Sign-in.** Google, directly (OpenID Connect with PKCE, state and nonce), with a 13+ and Terms consent checkbox. No email or password sign-in.
- **Sign in with publik.** Required right after Sparrow sign-in, before the first app page, using publik's official hosted-web module. AI runs on each student's own publik account.
- **Onboarding.**
  - A seven-step survey covering grade, state, stage, interests, goals, time and budget.
  - Resume import: PDF, DOCX or TXT, read in the browser with contact details removed, then analyzed by AI with evidence checks (or a no-AI parser).
  - A personalized plan, then a five-part run-through and a dock tour.
- **Home.** Up-next tasks, a six-week timeline, picked-for-you matches, the college shortlist and the activities list.
- **Explore.** A real, link-checked catalog of 78 long-running programs, ranked by deterministic match scoring. Filters, detail pages, and "Discover with AI" (publik web search).
- **Colleges.** 1,784 four-year public and private nonprofit colleges from the U.S. Department of Education College Scorecard. Search, filters, shortlist with tags and notes, compare up to four.
- **Plan.** A kanban board (drag or keyboard), tasks, a month calendar with `.ics` export, and a grade 9–12 roadmap.
- **Advisor.** Threaded AI conversations. Saved opportunities and colleges are sent as verified records with sources. Quick, Balanced and Deep tiers. Answers come back as structured cards with "Add as task".
- **Profile.** A Common App-style activities and honors builder with character counters, AI "Tighten to 150", resume re-import and a printable brag sheet.
- **Contribute.** Suggest an official link. An SSRF-safe fetch plus AI extraction produces a draft where every field quotes the page, and a reviewer approves it.
- **Rewards.** Points and badges for approved suggestions (no cash value), plus the publik AI allowance shown as a percentage.
- **Settings.** Your own publik key (stored encrypted), the usage-counting switch, reduced effects, JSON export, sign out everywhere, and account deletion.
- **Reviewer tools** (`SPARROW_ADMIN_EMAILS`). The review queue, catalog management, source re-checks with AI, and an audit log.

Design system: [DESIGN.md](DESIGN.md). Integration notes: [sparrow/PUBLIK-INTEGRATION.md](sparrow/PUBLIK-INTEGRATION.md). Status: [sparrow/IMPLEMENTATION-STATUS.md](sparrow/IMPLEMENTATION-STATUS.md).

## Architecture

| Path | What |
|---|---|
| `sparrow/src/` | Preact 11 + signals SPA (JSX), bundled by esbuild into `sparrow/dist/` |
| `sparrow/public/` | Static pages (landing, legal, 404, app shell) and images |
| `api/index.ts` | The single Vercel function. `vercel.json` rewrites every `/api/*` path to it |
| `server/` | The API (`app.mjs` route table), Google sign-in, the publik module and Postgres store, AI pipeline, matching, safe fetch, calendar |
| `shared/` | Taxonomy and text helpers used by both browser and server |
| `db/migrations/` | Postgres schema (RLS on, no REST access) |
| `db/seed/` | Curated opportunity catalog and the College Scorecard snapshot |
| `tests/` | Unit and integration tests (PGlite, fake publik, fake Google), and the browser smoke test |

## Run it locally

Requires Node 22.

```sh
npm ci
cp .env.example .env      # then fill in the values
npm run db:migrate
npm run db:seed
npm run dev               # build, then serve on http://127.0.0.1:4173
```

Google sign-in setup (Google Cloud console → APIs & Services):
- OAuth consent screen: External, app name Sparrow, scopes `openid`, `email`, `profile` (no verification review needed for these). Publish it to "In production" so anyone can sign in.
- Credentials → Create OAuth client ID → Web application. Authorized redirect URIs: `https://newsparrow.vercel.app/api/auth` and `http://127.0.0.1:4173/api/auth`.
- Put the client ID and secret in `SPARROW_GOOGLE_CLIENT_ID` and `SPARROW_GOOGLE_CLIENT_SECRET`.

Database: create a free Neon Postgres database (Vercel → Storage → Neon, or neon.tech) and put its **pooled** connection string in `DATABASE_URL`.

For local development, set `SPARROW_AUTH_ORIGIN=http://127.0.0.1:4173`.

## Tests

```sh
npm run build
npm run test:integration   # 46 unit and integration tests against in-process PGlite and test fakes
npm test                   # browser smoke test through the whole journey (needs Chrome or Edge; set CHROME_PATH if needed)
```

No test touches a real service or makes a billable call. Set `SPARROW_SHOTS=<folder>` to save screenshots from the smoke test.

## Deploy (Vercel)

1. Keep the project root at the repository root. `vercel.json` sets the build (`npm run build`), the output (`sparrow/dist`), the rewrites and the security headers.
2. Add every variable from `.env.example` in Vercel as server-side environment variables. `SPARROW_SUPPORT_EMAIL` is read at build time.
3. Run `npm run db:migrate && npm run db:seed` once against the production `DATABASE_URL`.
4. Push. Then open the site, sign in, and confirm the first page after sign-in is **Sign in with publik**.

## Data upkeep

| Command | What it does |
|---|---|
| `npm run catalog:check` | Re-checks every catalog link. `--write` drops dead ones |
| `npm run colleges:fetch -- --csv <file>` | Rebuilds the college snapshot from the Scorecard bulk file (or uses the API with `DATA_GOV_API_KEY`) |
| `node scripts/render-og.mjs` | Re-renders the social preview image |
