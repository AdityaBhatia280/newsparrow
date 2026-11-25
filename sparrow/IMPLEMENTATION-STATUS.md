# Implementation status (Nov 24, 2026)

The launch rebuild is code-complete on the `launch-redesign` branch. It is not deployed yet: deployment needs the owner's Google OAuth client, a Neon database, Vercel environment variables and a push.

## Built

**Identity and publik**
- Google sign-in (direct OpenID Connect: PKCE, state, nonce, checked ID-token claims) with a 13+/Terms consent. No Supabase.
- Required **Sign in with publik** through the official hosted-web module, with its records in Postgres.

**Persistence**
- Postgres for everything students create. RLS is enabled with no REST access; the server is the only client.
- The local-preview bypass and all browser-only storage of student work are gone.

**Data**
- 78 curated real programs: 72 links verified, 6 real sites that block automated checks.
- 1,784 colleges from the College Scorecard (bulk file released Nov 2, 2026).
- No deadlines or fees are seeded.

**Features**
- Onboarding survey, in-browser resume import, the AI plan and run-through.
- Home, Explore (including Discover with AI), Colleges with compare, Plan (board, tasks, calendar `.ics`, roadmap).
- Advisor threads, the activities builder with AI tighten, contributions with AI extraction, reviewer queue and catalog tools, rewards ledger and badges.
- Settings: own key, usage switch, export, delete account, sign out everywhere.

**Pages:** the landing page (WebGL hero), Privacy, Terms, Support and 404.

**Design:** the "Sky Glass" blue liquid-glass system with the floating bottom dock (see DESIGN.md).

## Verified

- `npm run build`: passes. The app bundle is about 200 KB minified; pdf.js loads only for resume import.
- `npm run test:integration`: 46 tests pass.
  - Auth and gate, isolation, encryption at rest, telemetry and opt-out.
  - Own key, and that the founder key is never used.
  - CRUD with cross-user negative tests on every owned resource.
  - The AI pipeline: idempotency, rate limits, 402/429/502/503 with no retry, redaction, evidence and ID checks.
  - Contributions, approval with a single reward, archive and re-check.
  - SSRF guards (private, IPv6 and mapped addresses, DNS rebinding, redirects).
  - The calendar format, and that `vercel.json` headers match the local server.
- `npm test`: 16 browser checks pass.
  - The full journey from landing to account deletion, including PDF resume upload and AI flows against a fake publik.
  - Every route at 1440/1024/768/390/320 px with no horizontal overflow.
  - Reduced motion, Escape on dialogs, and no console errors.

## Before launch (owner)

1. Google and the database (see README):
   - Create the Google OAuth web client and publish its consent screen to production.
   - Create a Neon Postgres database and copy its pooled `DATABASE_URL`.
2. Vercel: set every variable in `.env.example`, including `SPARROW_DATA_KEY`, `SPARROW_ADMIN_EMAILS` and `SPARROW_SUPPORT_EMAIL`.
3. Run `npm run db:migrate && npm run db:seed` against production.
4. Review the catalog in `db/seed/opportunities.json`, and the Privacy and Terms text.
5. Push and merge to `main`. publik holds the listing until two things are true:
   - its scan finds `/api/v1/installs`, `/api/v1/telemetry`, `app_opened` and `APP_SLUG` in the public repository's code;
   - the live site shows Sign in with publik right after sign-in.

   As of 2026-11-24, `server/publik/publik.server.mjs` matches the official module; only the types are removed and the slug is set. Do not announce before the listing is live. Then, on the live site, check:
   - Sign in, and confirm the next page is Sign in with publik.
   - Make one real AI request.
   - Run one catalog approval in Reviewer tools.

## Known limits

- Seeded listings show "check the official site" for dates and costs until a reviewer verifies them with quoted evidence.
- Discover uses publik search, which may need to be enabled for the listing.
- Rate limits for non-AI requests are per server instance. AI limits and idempotency are durable in the database.
- Hosting: Vercel (site and API), Neon (database), Google (sign-in). publik's backend-hosting billing covers Google Cloud and AWS only, not Vercel. publik's `POST /jobs` is for tasks that run and exit; Sparrow's server stays up to answer requests, so it does not apply.
  - To move the API to Cloud Run later: run `server/local.mjs` in a container with `HOST=0.0.0.0` and `PORT`, then proxy `/api/*` from Vercel. This keeps the same URL.
  - Vercel proxied requests time out at 120 s. A Vercel route transform can add a secret request header, so the Cloud Run service can refuse traffic that didn't come through Vercel.
  - The 2026-11 Dockerfile was removed in the rebuild; it pointed at files that no longer exist.
