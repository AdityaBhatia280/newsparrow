// Sparrow's own sign-in: Google, directly (OpenID Connect, authorization code with PKCE, state and nonce).
// After sign-in the visitor still has to pass "Sign in with publik" before any app page (see routes/session.mjs).
import { createHash, randomBytes } from "node:crypto";
import { adminEmails, googleAuth } from "../config.mjs";
import { HttpError, cookie, fail, readJson, sendJson } from "../http.mjs";
import { FLOW_COOKIE, LEGACY_COOKIE, accountCookie, clearCookies, readSealedCookie, sealSession, sessionKey } from "./session.mjs";

const FLOW_SECONDS = 600;
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** A stable Sparrow user ID (UUID shape) for a Google account's `sub`. */
export function userIdFor(sub) {
  const h = createHash("sha256").update("google:" + sub).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Creates or refreshes the app_users row for a verified Google account. */
export async function upsertUser(db, { id, email, givenName }, consent) {
  email = String(email || "").toLowerCase().slice(0, 254);
  const name = String(givenName || email.split("@")[0] || "").slice(0, 60) || null;
  const role = adminEmails().includes(email) ? "admin" : "student";
  const rows = await db.query(
    `insert into app_users (id, email, display_name, role, terms_accepted_at)
     values ($1, $2, $3, $4, case when $5::boolean then now() end)
     on conflict (id) do update set email = excluded.email, role = excluded.role,
       display_name = coalesce(app_users.display_name, excluded.display_name),
       terms_accepted_at = coalesce(app_users.terms_accepted_at, excluded.terms_accepted_at),
       last_seen_at = now()
     returning id, session_version`,
    [id, email, name, role, !!consent],
  );
  await db.query("insert into profiles (user_id) values ($1) on conflict (user_id) do nothing", [id]);
  return rows[0];
}

/**
 * Reads the ID token that came straight from Google's token endpoint over TLS
 * (OpenID Connect Core 3.1.3.7 allows TLS in place of the signature check here), and checks every claim.
 */
function readIdToken(token, { clientId, nonce }) {
  const part = typeof token === "string" ? token.split(".")[1] : null;
  if (!part) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Date.now() / 1000;
  if (!ISSUERS.has(claims.iss) || claims.aud !== clientId || !(claims.exp > now) || claims.nonce !== nonce) return null;
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || claims.email_verified !== true) return null;
  return claims;
}

export function createAuthHandler({ db, configuration = googleAuth, request = fetch }) {
  return async function authHandler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const settings = configuration(req);
    if (!settings) return sendJson(res, 503, { error: "Google sign-in is not configured for this Sparrow server yet." });
    if (!db) return sendJson(res, 503, { error: "Sparrow's database is not configured yet." });
    const { origin, clientId, clientSecret, authorizeUrl, tokenUrl } = settings;
    const key = sessionKey();
    const secure = origin.startsWith("https:");
    const url = new URL(req.url, origin);
    const callback = origin + "/api/auth";
    const endFlow = cookie(FLOW_COOKIE, "", { maxAge: 0, secure });
    const redirect = (destination, cookies = []) => {
      res.writeHead(303, { Location: destination, "Set-Cookie": cookies });
      res.end();
    };
    try {
      if (req.method === "GET") {
        if (!url.search) return sendJson(res, 405, { error: "Use POST." });
        const flow = readSealedCookie(req.headers.cookie, key, FLOW_COOKIE);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !flow?.verifier || !flow.consent || !state || state !== flow.state) return redirect("/app?auth=retry", [endFlow]);
        try {
          const response = await request(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              code_verifier: flow.verifier,
              redirect_uri: callback,
              client_id: clientId,
              client_secret: clientSecret,
            }).toString(),
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) throw new Error("AUTH_PROVIDER");
          const claims = readIdToken((await response.json())?.id_token, { clientId, nonce: flow.nonce });
          if (!claims) throw new Error("AUTH_PROVIDER");
          const row = await upsertUser(db, { id: userIdFor(claims.sub), email: claims.email, givenName: claims.given_name }, flow.consent);
          return redirect("/app", [
            accountCookie({ uid: row.id, ver: row.session_version }, key, secure),
            endFlow,
            cookie(LEGACY_COOKIE, "", { maxAge: 0, secure }),
          ]);
        } catch {
          return redirect("/app?auth=retry", [endFlow]);
        }
      }
      if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
      if (req.headers.origin !== origin || !/^application\/json\b/.test(req.headers["content-type"] || ""))
        return sendJson(res, 403, { error: "Start sign-in from Sparrow." });
      const input = await readJson(req, 2048);
      if (input?.action === "sign_out") {
        res.setHeader("Set-Cookie", clearCookies(secure));
        return sendJson(res, 200, { signedOut: true });
      }
      if (input?.action !== "google") fail(400, "Use Continue with Google to sign in.");
      if (input.consent !== true) fail(400, "Confirm that you're 13 or older and agree to the Terms and Privacy Policy.");
      const verifier = randomBytes(48).toString("base64url");
      const state = randomBytes(24).toString("base64url");
      const nonce = randomBytes(24).toString("base64url");
      const destination = new URL(authorizeUrl);
      destination.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callback,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        prompt: "select_account",
      });
      res.setHeader("Set-Cookie", cookie(FLOW_COOKIE, sealSession({ verifier, state, nonce, consent: true }, key, FLOW_SECONDS), { maxAge: FLOW_SECONDS, secure }));
      return sendJson(res, 200, { url: destination.href });
    } catch (error) {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
      return sendJson(res, 503, { error: "Sign-in couldn't be completed. Try again in a moment." });
    }
  };
}
