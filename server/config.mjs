// Server configuration. Values are read at call time so tests can set the environment first.
// Never log or return secret values.

export const PRODUCTION_ORIGIN = "https://newsparrow.vercel.app";

export function hosted() {
  return !!(process.env.VERCEL || process.env.K_SERVICE || process.env.NODE_ENV === "production");
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1):\d+$/;

/** The public origin for this request: SPARROW_AUTH_ORIGIN in hosted runtimes, the loopback host in development. */
export function appOrigin(req) {
  // Vercel preview deployments sign in on their own URL (add each preview's /api/auth to the Google client's redirect URIs to sign in there).
  if (process.env.VERCEL_ENV === "preview") {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    if (host && [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].includes(host)) return "https://" + host;
  }
  if (process.env.SPARROW_AUTH_ORIGIN) return new URL(process.env.SPARROW_AUTH_ORIGIN).origin;
  const host = String(req.headers.host || "");
  if (!hosted() && LOCAL_HOST.test(host)) return "http://" + host;
  return PRODUCTION_ORIGIN;
}

/** Origins allowed to send state-changing requests. */
export function allowedOrigins(req) {
  const set = new Set([PRODUCTION_ORIGIN]);
  if (process.env.SPARROW_AUTH_ORIGIN) set.add(new URL(process.env.SPARROW_AUTH_ORIGIN).origin);
  if (process.env.VERCEL_URL) set.add("https://" + process.env.VERCEL_URL);
  if (process.env.VERCEL_BRANCH_URL) set.add("https://" + process.env.VERCEL_BRANCH_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) set.add("https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const host = String(req.headers.host || "");
  if (!hosted() && LOCAL_HOST.test(host)) set.add("http://" + host);
  return set;
}

export function adminEmails() {
  return (process.env.SPARROW_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Google sign-in (an OAuth "Web application" client whose redirect URI is <origin>/api/auth). */
export function googleAuth(req) {
  const clientId = process.env.SPARROW_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.SPARROW_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    origin: appOrigin(req),
    clientId,
    clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  };
}

export function secureCookies(req) {
  return appOrigin(req).startsWith("https:");
}
