# Cloud Run preparation

Target existing Google Cloud project: `publik-515015` (display name: publik). Ownership was verified in the signed-in Cloud Console. The owner email is intentionally not committed to this public repository.

No Cloud Run service was deployed during preparation. The console showed an empty Cloud Run overview and a paid billing account; organizer sponsorship and its monthly budget were not confirmed. Do not launch paid resources until that billing arrangement or an explicit owner spending limit is established.

## Prepared locally

- Dockerfile using Node 22 and the existing HTTP server, running as the unprivileged node user.
- The server honors PORT and listens on 0.0.0.0 in Cloud Run; local development retains its loopback default.
- Production/Cloud Run session cookies use Secure, HttpOnly, and SameSite attributes. Local-origin development exceptions are disabled in hosted environments.
- Docker and gcloud upload exclusions keep environment files, local tooling, credentials, screenshots, and dependency caches out of the deployment context.

## Before deployment

1. Have the organizer link the project's billing and confirm the agreed budget. Keep the Google project under the owner's control.
2. Complete the current official publik hosted-web SDK migration: a real app login, private database-backed per-user key storage, and ensureUser(userId). The earlier cookie-based adapter is an undeployed draft, not a replacement for these requirements.
3. Configure runtime secrets through Secret Manager, never Docker build arguments or source files. Use a dedicated runtime service account with only the required secret access; review IAM grants before applying them.
4. Review a conservative initial service configuration: minimum instances 0, maximum instances 1, 1 CPU, 512 MiB, and a 60-second request timeout. These settings do not guarantee free use or a hard spending cap. Region and network exposure remain deployment decisions.
5. Keep the service private until the app authentication and Vercel-to-Cloud-Run invocation path have been reviewed. Do not silently enable unauthenticated invocation.
6. Run npm run build, npm run test:integration, and npm test, then build/test the container with a Docker engine or approved Cloud Build environment. The current machine has not verified a container build.
7. After deployment, verify the real hosted sign-in gate, separate users, official usage attribution, one deliberate AI request, and a real provider failure without automatic retries. Only then update the Vercel API routing and record the actual Cloud Run URL.

The container definition alone does not complete publik integration, database setup, a Cloud Run migration, billing sponsorship, or production verification.
