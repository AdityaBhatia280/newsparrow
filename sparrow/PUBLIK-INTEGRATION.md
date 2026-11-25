# publik integration

**Identity**

| | |
|---|---|
| Listing | **Sparrow** |
| Slug | `newsparrow` |
| Repository | `AdityaBhatia280/newsparrow` (public) |
| Hosted URL | https://newsparrow.vercel.app/ |
| Listing URL | https://publikhq.com/newsparrow |
| `publik.json` | `outputType: "hosted_web"` |

## Order of screens

1. Public pages: landing, privacy, terms, support. No sign-in.
2. `/app`: Sparrow sign-in, with Google (direct OpenID Connect, PKCE), with a 13+/Terms consent.
3. **Sign in with publik**, before any app page. `GET /api/session` calls `ensureUser(userId)`.
   - Until the person is `claimed`, the app shows the gate. It behaves like the module's `gatePage()`: the claim link carries `return_to`, and `/api/publik/status` is polled every 3 seconds for up to 10 minutes. Unreachable shows Retry.
   - Every app API route answers `428 publik_sign_in` until then, so the gate can't be bypassed from the browser.
4. Onboarding, then the workspace.

## Modules

| File | Role |
|---|---|
| `server/publik/publik.server.mjs` | publik's official hosted-web module (https://publikhq.com/sdk/publik.server.ts.md), TypeScript types removed, logic unchanged. Holds `APP_SLUG = "newsparrow"` and `APP_VERSION`. |
| `server/publik/store.mjs` | `useStore()` backed by Postgres (`publik_users`: one row per user ID, the module record as JSON). The `pk_` key is AES-256-GCM encrypted with `SPARROW_DATA_KEY`. |
| `server/publik/wallet.mjs` | A fresh, money-free wallet read for consent and usage screens: `remaining_percent`, `prepaid_remaining_percent`, `ai_providers`, `hasPlan`, `top_up_url`. |
| `server/ai/client.mjs` | The only path to `POST /chat/completions` and `POST /search` (see below). |

**AI call pipeline** (`server/ai/client.mjs`):
- `resolveProvider(userId, ownKey)` picks the key: the person's encrypted own `pk_` key if they set one, otherwise their publik key.
- Rate limits are 6 per minute and 60 per day per person, stored in the database.
- `provider_requests` provides idempotency: the same `requestId` answers 409.
- 402 returns the provider message plus exactly one `top_up_url`; 429 passes on `Retry-After`.
- A network failure is recorded as "unknown" and never retried.
- Output is validated with Zod.

Telemetry:
- `trackActive` runs on every app request; `/api/ping` is a content-free heartbeat while a tab is visible.
- The Settings switch calls `setUsage`.
- `app_opened` and `active_session` come only from the module.

## What is sent to AI

Only after the student confirms. The consent line names `ai_providers` from a fresh wallet read.

| Feature | Tier | Sent |
|---|---|---|
| Resume analysis | balanced | Resume text with emails, phones, links and addresses removed (in the browser, then again on the server) |
| Onboarding plan | balanced | Profile fields (no name or email), activities, 20 candidate listings |
| Advisor | fast / balanced / smart | Question, chosen profile fields, optional activities, recent thread, and selected saved opportunities and colleges as records with sources |
| Tighten activity | fast | That activity's name, role and description |
| Contribution extraction / re-check | fast | Text of a public page fetched with SSRF protection |
| Discover | `/search` | The search phrase |

Never sent: names, emails, account IDs, notes, other people's data, or keys. Model output is checked:
- Unknown record IDs and sources are removed.
- Resume items and extracted fields are kept only when their quoted evidence appears in the source.
- Executable content is rejected.

## Verification

`npm run test:integration` checks:
- the gate (428 before claim);
- per-person installs and encrypted keys;
- no credentials in responses;
- `app_opened` → `active_session`, and the usage opt-out;
- own key usage;
- that the founder key is never used;
- 402/429/502/503 handling without retries;
- idempotency and rate limits;
- evidence and ID filtering, and redaction.

All of this runs against a local fake publik. `npm test` drives the same flow in a browser.

**Still to confirm in production:**
- After the first deploy, open the live URL, sign in, and confirm the next page is **Sign in with publik**.
- Make one deliberate real AI request.
- Discover uses `POST /search`. If the listing needs search enabled separately, publik's error message is shown to the student.
