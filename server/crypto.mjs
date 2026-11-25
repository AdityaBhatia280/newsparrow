// Encryption at rest for secrets the server must keep (publik keys). AES-256-GCM.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function dataKey() {
  const secret = process.env.SPARROW_DATA_KEY;
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Set SPARROW_DATA_KEY on the server: 32 or more random characters.");
  return createHash("sha256").update("sparrow-data-v1\n" + secret).digest();
}

export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function decryptSecret(sealed) {
  if (typeof sealed !== "string" || !sealed.startsWith("v1.")) throw new Error("Unsupported secret format");
  const bytes = Buffer.from(sealed.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
