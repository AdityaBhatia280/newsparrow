# Publik integration

Approved identity: **Sparrow**. Repository: `AdityaBhatia280/newsparrow`. Slug: `newsparrow`. Hosted URL: https://newsparrow.vercel.app/. Listing URL: https://publikhq.com/newsparrow. Publik's submission response reported `live`; app token minting enabled `ai.chat`. No license was added.

## Modules and session boundary

- `server/publik.mjs`: copied from the first TypeScript code block in the current official SDK, with types stripped and hosted-request adaptations documented below. App slug and version are literal constants in code.
- `server/publik-handler.mjs`: same-origin Node API handler for the sign-in gate, provider choice, telemetry, and a constrained advisor request.
- `server/session.mjs`: AES-256-GCM session sealing, seven-day expiry, HttpOnly/SameSite cookies, and Secure cookies on Vercel. Each visitor receives a distinct install credential. No founder API-key override is used for hosted requests.
- `sparrow/dist/publik.js`: browser gate UI and server bridge. `app.js` awaits `ensureSignedIn()` before rendering any application-owned page. The HTML shell itself starts with the sign-in screen.
- `api/publik.ts`: Vercel function entry point; it imports server code, never a public bundle.

The official module's desktop credential reader/writer is overridden through AsyncLocalStorage only for hosted requests. Its normal install, wallet, plan choice, tier models, telemetry endpoints, and response handling are retained. The browser handles the nonblocking sign-in poll. Hosted telemetry uses the current visitor's install ID and key, sends app_opened after the gate, and active_session every 30 minutes while the app is open. There is no second telemetry SDK.

`PUBLIK_APP_TOKEN` is a server environment value, not a committed public token file. `SPARROW_SESSION_SECRET` must remain stable across deployments to preserve sessions; rotation invalidates existing cookies. No token values belong in prompts, logs, screenshots, or commits. Native Node environment-file loading is used only for local development; Vercel supplies server environment values directly.

## Advisor contract

Only a confirmed request sends the task, draft, and explicitly included profile fields. Names, account IDs, unrelated records, college notes, saved notes, API keys, and fictional opportunity facts are excluded. Experience is opt-in and limited to 1,500 characters. Input/output are validated with Zod. Unknown record IDs, invented source IDs, unsupported fields, and executable content are rejected.

No verified records are present, so the server prompt permits general planning and draft feedback, not factual program comparisons. At most three recommendations are returned. Everything renders as escaped text. The provider choice is a connected publik plan or the visitor's own personal publik API key. No model call runs on page loads, filters, or checkboxes.

402 responses retain the provider's message and one verified publik link. Failures retain drafts. Billable operations are not automatically retried. Sparrow reward credits remain zero and independent of publik billing. Usage is shown only as provider percentages, never monetary amounts.

## Verification and limits

The automated suite checks the gate before the landing page, session/credential isolation, a founder-key override negative test, encrypted-cookie tampering, CSRF, usage opt-out, independent telemetry, strict advisor output, duplicate requests within one process, 402 behavior, and browser workflows at five widths. Its provider is explicitly a test fixture, never a production success simulation.

Still required for full production readiness: durable private profile storage, a server session registry/revocation policy, distributed rate limiting, durable cross-instance request reconciliation/idempotency, approved verified sources, ingestion/moderation, privacy/support operations, and real user/provider verification. Current duplicate prevention and rate limits are per process; they do not claim distributed or durable guarantees. Sign-out clears this browser's session cookie; provider-side key revocation is independent.

A real hosted proof must confirm the public URL shows the sign-in gate first. A real authenticated AI request and its provider errors must be checked separately from the fixture tests. Publication and runtime verification status are recorded in IMPLEMENTATION-STATUS.md.
