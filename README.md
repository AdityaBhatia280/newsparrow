# Sparrow

Interactive foundation for a college-preparation and extracurricular planning app. This repository follows the supplied college-preparation brief and contains no video-editor infrastructure.

Run with Node 22 or newer:

```sh
npm start
```

Open http://127.0.0.1:4173. No installation or build is required. Deployable static files are in `sparrow/dist/`.

## Vercel deployment

Import this repository with the project Root Directory set to the repository root (leave it blank). The committed `vercel.json` selects the **Other** framework preset, skips dependency installation, runs `npm run check`, and serves `sparrow/dist/` as the output directory. The local `npm start` command is not the deployment build command.

Push changes to the connected production branch to redeploy. App routes use hashes, such as `/#/opportunities`, so no catch-all rewrite is required. Missing asset URLs retain normal 404 responses.

The deployed preview remains browser-local. Publik sign-in, AI, and server persistence still require their separate integration.

```sh
npm run check
npm test
```

The browser smoke test uses an isolated headless Chrome or Edge profile, launches its own loopback server, and closes only its own browser process. Set `CHROME_PATH` if the browser is not in a standard Windows location.

Implemented routes: `/`, `/start`, `/onboarding`, `/opportunities`, `/opportunities/:id`, `/saved`, `/colleges`, `/colleges/:id`, `/advisor`, `/contribute`, `/credits`, and `/settings`, using hash routing. `/review` explains that moderation is unavailable. Unknown routes show a recovery page.

Data stays in this browser's localStorage under `sparrow.preview.v1`. Settings supports JSON export and full local deletion. Use sample information; this is not secure account storage.

Opportunity records are fictional. College names link to official homepages but are not complete verified records. AI, identity, resume parsing, source fetching, moderation, billing, rewards, transfers, and official usage counting are not connected. The credit view is fixed at zero.

See [implementation status](sparrow/IMPLEMENTATION-STATUS.md) for validation and production handoff. The static preview is live at https://newsparrow.vercel.app/. Publik listing, sign-in, and API integration remain pending.
