# Sparrow

A college-preparation and extracurricular planning app. Live website: https://newsparrow.vercel.app/. Publik listing: https://publikhq.com/newsparrow.

Sparrow opens with Sign in with publik. The server adapts the official publik module to separate visitor sessions. Provider credentials live in encrypted, HttpOnly cookies and server environment configuration; no credentials are exposed to frontend JavaScript or localStorage.

## Development

Use Node 22.15 or newer within the Node 22 release line:

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:4173. Local start loads the ignored `.env` using Node's native environment-file support. Configure `PUBLIK_APP_TOKEN` and `SPARROW_SESSION_SECRET` in the server environment. Never commit or share their values.

```sh
npm run test:integration
npm test
```

Integration tests use an isolated local fake provider. Browser tests launch an isolated headless Chrome/Edge profile and exercise the real sign-in adapter against that test fixture, never a production authentication bypass. Set `CHROME_PATH` if necessary. No test makes a paid provider call.

## Vercel

Keep the project Root Directory at the repository root. `vercel.json` uses the Other framework preset, `npm ci`, `npm run build`, static output `sparrow/dist/`, and a Node API function at `/api/publik`. Set `PUBLIK_APP_TOKEN` and `SPARROW_SESSION_SECRET` as sensitive server environment variables before deploying. They must not have public frontend prefixes. Push the production branch to deploy.

The site uses hash routes (`/#/opportunities`), so no catch-all rewrite is required. The API function keeps credentials and paid requests on the server. A missing server configuration produces an honest unavailable sign-in screen.

## Current scope

Onboarding, example opportunities/details, application statuses/tasks, college shortlists, local submissions, and the Sparrow zero-credit explanation remain available. The Advisor supports explicit, confirmed general planning and draft feedback through `publik-balanced`, with validated structured output and saved browser-local responses. Personal publik keys can be configured in Settings. Official usage counting is optional and can be turned off.

Profile data and work remain browser-local, under a namespace for this sign-in. They do not sync across devices. Settings supports export, deletion, and explicit import of the earlier unsigned local preview. LocalStorage is not a private cloud database; use sample information and avoid sensitive data.

Opportunity records are fictional and are not sent to AI as verified records. College entries are illustrative records with official homepages. Source fetching, extraction, moderation, resume parsing, real Sparrow credit purchases/transfers, and a verified catalog remain unconnected.

See [integration notes](sparrow/PUBLIK-INTEGRATION.md) and [implementation status](sparrow/IMPLEMENTATION-STATUS.md) for proof and limitations.
