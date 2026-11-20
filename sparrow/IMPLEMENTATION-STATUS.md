# Implementation status

Stage A is implemented. Publik sign-in and Advisor integration are drafted and tested locally. Vercel server secrets are configured, but production rollout remains pending the current official hosted-web SDK migration, a real app login, private database storage, and deployment funding decisions.

## Cloud Run preparation (2026-11-17)

The signed-in Google Cloud Console showed existing project `publik-515015`, display name publik; its ownership was verified in IAM. The private owner email is not recorded in this public source file. Cloud Run showed its initial setup overview with no deployed service. A paid billing account was present, but organizer sponsorship and the agreed monthly budget were not confirmed.

Prepared a Dockerfile, secret-safe Docker/gcloud upload exclusions, Cloud Run PORT/0.0.0.0 listening, and Secure cookies with local-origin exceptions disabled in hosted runtimes. No paid service, public invoker access, billing change, or Cloud Run deployment was created. Docker/gcloud executables are not installed on this machine, so no container build is claimed. See [cloudrun/README.md](../cloudrun/README.md) for remaining steps.


## Updated hosted-web requirements (2026-11-17)

The current raw publik setup guide now specifies the official `publik.server.ts` module, an existing app sign-in, and database-backed per-user publik records. The earlier encrypted-cookie adapter remains an undeployed draft and must be migrated to this supported server module before production rollout. Sparrow currently has neither a configured app identity provider nor a private database. Backend selection/configuration is the next required input; no second listing or app token should be created. Vercel CLI access has been verified and the existing `newsparrow` project has been linked.

The existing draft still passes `npm run build`, `npm run test:integration`, and all 18 browser smoke checks. Those results do not prove compliance with the newly supplied hosted-web module or a production AI request.

## Publik setup progress

- Publik accepted the approved listing as **Sparrow** at https://publikhq.com/newsparrow, with response status `live` and `ai.chat` enabled. Slug remains `newsparrow`. No license was added.
- Official Node module adapted for isolated hosted-web visitor sessions, encrypted HttpOnly cookies, a first-screen sign-in gate, plan/personal-key choices, and official telemetry with opt-out.
- Advisor request context and response schema are validated with Zod; no fictional listing facts are passed as verified sources. Explicit confirmation is required. 402/provider failures retain drafts and do not automatically retry.
- Real local upstream check succeeded: the minted server token provisioned a publik install, GET /wallet answered, and the app displayed its Sign in with publik gate and official claim link. No model request was sent in that check.
- Automated provider/session integration checks passed. Browser checks cover the gate, ordinary workflows, confirmed AI requests against an isolated fixture, and draft retention on 402. The production AI path still needs a real signed-in user request.
- Vercel CLI access is verified and the existing project is linked. `PUBLIK_APP_TOKEN`, `SPARROW_SESSION_SECRET`, and `PUBLIK_INSTALL_SECRET` are configured as sensitive production server values. The existing static production deployment remains unchanged while the supported hosted-web module, real app login, and private database are completed.
- See [PUBLIK-INTEGRATION.md](PUBLIK-INTEGRATION.md) for architecture and remaining production limits. The historical foundation notes below describe the earlier preview.

## Working

- Responsive editorial landing with original Sparrow wing mark and product UI, orange/white/charcoal identity, labeled illustrative content, working navigation, and reduced-motion support.
- Six-step onboarding with validation, back navigation, per-input autosave, review, and later edits preserving saved work.
- Six fictional opportunity records; query, type, interest, grade, format, location, and free filters; example detail pages and deterministic profile fit notes.
- Local saved opportunities with independent application status, note, personal date, task creation/completion/removal, timestamps, and confirmation before removing personal work.
- Six real college names in an example directory, official homepage links, search, local shortlist, and private local notes. No admission predictions or unverified statistics.
- Advisor task selection and local request draft, context review, explicit disconnected state, unavailable credit estimate, and disabled AI action.
- Official-link contribution form with client-side URL checks, duplicate prevention, local pending status, editing and deletion. No URL fetching or official moderation.
- Fixed zero-credit account, explanatory categories, empty usage history, disabled purchases/transfers, and preview-invite copying.
- Settings with profile review, JSON export, local deletion, and storage-failure messaging.

## Validation

- JavaScript syntax checks.
- All 16 automated browser smoke checks passed. They cover onboarding, input escaping, search/filtering, save/track/status, independent personal fields, tasks, destructive confirmations, college notes, submission validation/editing, advisor context selection, draft persistence, reload retention, all routes across 1440/1024/768/390/320 widths, mobile menu and Escape, skip-link focus, reduced motion, local deletion, and uncaught browser exceptions.
- Landing screenshots inspected at desktop and mobile; additional tablet captures recorded.
- Final design gate result: `GATE: OPEN 46 (rounds used up)`, with no waivers. Its generic landing checker does not recognize hash-router destinations and conflicts with the owner's required headline and compact application footer; additional layout/rhythm findings also remain. The full open-finding list is preserved in [QA-REPORT.md](QA-REPORT.md). The design gate is not claimed to pass.

## Not connected / not claimed

Secure identity, database, cross-user permissions, verified opportunity catalog, resume parsing, extraction, moderation, AI calls, credit accounting, payments, transfers, official usage counting, and publik listing. Static preview deployment on Vercel is verified below.

## Deployment and production handoff

Vercel configuration added: the repository-root `vercel.json` explicitly serves `sparrow/dist/`, skips installation (there are no runtime dependencies), and runs `npm run check` before deployment. The project Root Directory must remain the repository root. The reported `https://newsparrow.vercel.app/` returned HTTP 404 before this configuration was added. After pushing the fix, the live homepage and all ten runtime assets returned HTTP 200 with their expected content types. The homepage title is “Sparrow — Find your next step.”

`sparrow/dist/` is a buildless static bundle. `npm start` serves it on the loopback interface. The owner connected the public repository to Vercel; the static preview is now accessible at `https://newsparrow.vercel.app/`. No services were purchased during the repair.

`sparrow/sparrow-preview.zip` contains the static deployment bundle. Run instructions and source remain in the workspace. Desktop, tablet, and mobile screenshots are in `sparrow/shots/`.

The initial foundation session had no Sites publishing tools, so it did not perform owner-private hosting. The later Vercel deployment is separate from Sites and from the pending publik listing.

The owner's complete supplied brief is preserved in `Sparrow-Publishing.md`. For Phase B, select production storage and a supported publik hosted-web identity recipe before adding user accounts. At production integration time fetch the current raw `https://publikhq.com/skills/setup.md`, follow the device/listing approval order, reuse an existing listing, and test the real release and per-user attribution. Do not substitute this foundation for production integration.

Before student launch, replace fictional content with reviewed source-backed records; confirm application cycles, fees, eligibility, official deadlines and timezones; add working privacy/support information; validate identity isolation, safe fetching, moderation, and transactional billing; connect and verify official usage counting.
