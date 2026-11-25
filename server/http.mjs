// Small HTTP helpers shared by every route.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

export const RESPONSE = Symbol("response");
/** A handler result with a status other than 200, extra headers, or a non-JSON (raw) body. */
export const respond = (status, body, { headers = {}, raw = false } = {}) => ({ [RESPONSE]: true, status, body, headers, raw });

const SECRETS = /(?:pat_|pk_|pbt_|sb_secret_)[A-Za-z0-9_-]+/g;
/** Removes anything shaped like a credential and caps the length of provider text. */
export const redact = (s, max = 900) => String(s ?? "").replace(SECRETS, "[redacted]").slice(0, max);

/** Only a plain https link on publikhq.com may be shown as a publik link. */
export function publikLink(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "publikhq.com" && !u.username && !u.password && !SECRETS.test(u.href)
      ? u.href
      : null;
  } catch {
    return null;
  } finally {
    SECRETS.lastIndex = 0;
  }
}

export async function readJson(req, limit = 32_000) {
  if (req.body !== undefined && req.body !== null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > limit) fail(413, "That request is too large.");
    return req.body;
  }
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    const raw = String(req.body);
    if (Buffer.byteLength(raw) > limit) fail(413, "That request is too large.");
    return parse(raw);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, "That request is too large.");
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString("utf8"));
}

function parse(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, "That request is not valid JSON.");
  }
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function cookie(name, value, { maxAge, secure, httpOnly = true }) {
  return `${name}=${value}; Path=/; ${httpOnly ? "HttpOnly; " : ""}SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export function sendJson(res, status, value, cookies = []) {
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

/** Formats a Zod error into one readable sentence for the person filling the form. */
export function zodMessage(error, fallback = "Check the form and try again.") {
  const issue = error?.issues?.[0];
  if (!issue) return fallback;
  return issue.message && !/^(Invalid|Expected|Too)/.test(issue.message) ? issue.message : fallback;
}

export function parseWith(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) fail(400, message || zodMessage(result.error));
  return result.data;
}
