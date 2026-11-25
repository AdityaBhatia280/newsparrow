// Sealed (AES-256-GCM) HttpOnly cookies for the Sparrow account session.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookie, parseCookies } from "../http.mjs";

export const ACCOUNT_COOKIE = "sparrow_account";
export const FLOW_COOKIE = "sparrow_login";
export const LEGACY_COOKIE = "sparrow_session";
export const SESSION_SECONDS = 7 * 86400;

export function sessionKey(secret = process.env.SPARROW_SESSION_SECRET) {
  if (typeof secret !== "string" || secret.length < 40) throw new Error("Server session encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function sealSession(value, key, seconds = SESSION_SECONDS) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ ...value, expires: Date.now() + seconds * 1000 }), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function readSealedCookie(header, key, name) {
  const token = parseCookies(header)[name];
  if (!token || token.length > 3900) return null;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
    if (!Number.isFinite(value.expires) || value.expires < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

/** The signed-in account from the request, or null. */
export function readAccount(req, key) {
  const value = readSealedCookie(req.headers.cookie, key, ACCOUNT_COOKIE);
  return typeof value?.uid === "string" && /^[0-9a-f-]{36}$/i.test(value.uid) ? value : null;
}

export function accountCookie(account, key, secure) {
  return cookie(ACCOUNT_COOKIE, sealSession({ uid: account.uid, ver: account.ver }, key), { maxAge: SESSION_SECONDS, secure });
}

export function clearCookies(secure) {
  return [ACCOUNT_COOKIE, FLOW_COOKIE, LEGACY_COOKIE].map((name) => cookie(name, "", { maxAge: 0, secure }));
}
