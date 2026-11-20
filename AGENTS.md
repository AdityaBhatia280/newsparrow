## publik API

- Base URL: https://publikhq.com/api/v1 (OpenAI Chat Completions, Responses, Anthropic Messages).
- Models: publik-fast, publik-balanced, publik-smart only; never a vendor model name.
- Sign in with publik: the official module adapted in server/publik.mjs runs through a per-request server context; the browser's ensureSignedIn() bridge blocks the first app screen.
- Hosted web: each visitor has a separate encrypted, HttpOnly session cookie. Never use a shared filesystem credential or founder PUBLIK_API_KEY for visitors.
- The module sends app_opened after the gate and active_session every 30 minutes while the app is open. Do not add a second telemetry SDK.
- App token: PUBLIK_APP_TOKEN in server environment only. SPARROW_SESSION_SECRET encrypts sessions. Never print, log, expose to frontend, or commit credentials.
- 402: show error.message + error.top_up_url only; preserve drafts and never automatically retry a billable call.
- Show provider usage as remaining_percent or prepaid_remaining_percent, never money. Sparrow reward credits remain separate.
- Docs: https://publikhq.com/llms.txt, https://publikhq.com/developers, https://publikhq.com/skills/api.md.
- Run npm run build, npm run test:integration, and npm test before deploying auth/AI changes. Integration tests must use the isolated local fake provider; never make billable test calls without the user's existing authorization.
