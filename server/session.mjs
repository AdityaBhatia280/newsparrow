import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

const COOKIE = "sparrow_session";
const MAX_AGE = 60 * 60 * 24 * 7;
export function sessionKey(secret = process.env.SPARROW_SESSION_SECRET) {
  if (typeof secret !== "string" || secret.length < 40)
    throw new Error("Server session encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}
export function sealSession(session, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(
      JSON.stringify({ ...session, expires: Date.now() + MAX_AGE * 1000 }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function readSession(cookie, key) {
  const token = String(cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!token || token.length > 3900) return null;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const plain = Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const value = JSON.parse(plain);
    if (
      !Number.isFinite(value.expires) ||
      value.expires < Date.now() ||
      typeof value.install?.key !== "string" ||
      !value.install.key.startsWith("pk_")
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function setSession(res, session, key, secure) {
  const token = sealSession(session, key);
  if (token.length > 3800)
    throw new Error("Session exceeds the supported size.");
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`,
  );
}
export function clearSession(res, secure) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`,
  );
}
export function principal(credential, wallet, key) {
  const identity =
    wallet.account?.id != null
      ? "account:" + String(wallet.account.id)
      : wallet.account?.handle
        ? "handle:" + String(wallet.account.handle)
        : "install:" + credential.install_id;
  return createHash("sha256")
    .update(key)
    .update(identity)
    .digest("hex")
    .slice(0, 32);
}
