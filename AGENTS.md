## publik API

- Base URL: https://publikhq.com/api/v1 (OpenAI Chat Completions, Responses, Anthropic Messages, search).
- Models: publik-fast, publik-balanced, publik-smart only; never a vendor model name.
- Sign-in order: Sparrow's own sign-in (Google, directly: `server/auth/google.mjs`), then **Sign in with publik** before the first app page. There is no skip. `server/publik/publik.server.mjs` is publik's official hosted-web module (types stripped; keep `APP_SLUG = "newsparrow"`, `/api/v1/installs`, `/api/v1/telemetry` and `app_opened` in code). Every app API route enforces the gate with 428 `publik_sign_in`.
- Per-user publik records live in Postgres (`publik_users`) through `server/publik/store.mjs`. The `pk_` key is encrypted with `SPARROW_DATA_KEY` and never reaches a browser, log or response. Never use a shared filesystem credential or a founder `PUBLIK_API_KEY` for visitors.
- Telemetry: the module's `trackActive` runs on app requests (app_opened, then active_session every 30 minutes). The usage switch calls `setUsage`. Do not add a second telemetry SDK.
- Server-only secrets: `PUBLIK_APP_TOKEN`, `PUBLIK_INSTALL_SECRET`, `SPARROW_SESSION_SECRET`, `SPARROW_DATA_KEY`, `DATABASE_URL`, `SPARROW_GOOGLE_CLIENT_SECRET`. Never print, log, expose to the frontend, or commit them.
- Every AI call goes through `server/ai/client.mjs`:
  - Zod input with `confirmed: true` and a `requestId`.
  - Per-user DB rate limits.
  - `provider_requests` idempotency.
  - Validated output, with unknown record IDs and unquoted evidence dropped.
  - No automatic retries.
- 402: show `error.message` and the one `top_up_url` only. Preserve drafts.
- Show provider usage as `remaining_percent` or `prepaid_remaining_percent`, never money. Sparrow reward points are separate and have no cash value.
- Docs: https://publikhq.com/llms.txt, https://publikhq.com/developers, https://publikhq.com/sdk/publik.server.ts.md.

## Working on Sparrow

- Brand: blue "Sky Glass" (see DESIGN.md). Orange is retired.
- Layout: the frontend is in `sparrow/src` (Preact + esbuild). `sparrow/dist` is build output and is not committed.
- Facts: never invent opportunity details. Seeded listings carry stable facts only. Dates and costs are shown as facts only after a reviewer verifies them with quoted evidence.
- Before deploying, run `npm run build`, `npm run test:integration` and `npm test`. Tests use PGlite and local fakes only; never make billable test calls without the user's existing authorization.
