// The Sparrow API: one route table served by the Vercel function (api/index.ts) and the local server.
// Access levels: public, user (Sparrow sign-in), app (sign-in + Sign in with publik), admin (app + reviewer email).
import { adminEmails, allowedOrigins, secureCookies, googleAuth } from "./config.mjs";
import { HttpError, RESPONSE, fail, readJson, redact, sendJson } from "./http.mjs";
import { accountCookie, clearCookies, readAccount, sessionKey } from "./auth/session.mjs";
import { createAuthHandler } from "./auth/google.mjs";
import { defaultDb } from "./db/index.mjs";
import { ensureUser, trackActive, useStore } from "./publik/publik.server.mjs";
import { createPublikStore } from "./publik/store.mjs";
import { safeFetchPage } from "./safe-fetch.mjs";
import routes from "./routes/index.mjs";

function compile(list) {
  return list.map((route) => {
    const names = [];
    const pattern = new RegExp(
      "^" + route.path.replace(/[.]/g, "\\.").replace(/:(\w+)/g, (_, name) => (names.push(name), "([^/]+)")) + "$",
    );
    return { ...route, pattern, names };
  });
}

export function createApp(deps = {}) {
  const db = deps.db === undefined ? defaultDb() : deps.db;
  if (db) useStore(createPublikStore(db));
  const auth = createAuthHandler({ db, ...(deps.auth || {}) });
  const table = compile(routes);
  const limits = new Map();
  const services = {
    fetchPage: deps.fetchPage || safeFetchPage,
    now: deps.now || (() => new Date()),
    authConfig: deps.auth?.configuration || googleAuth,
  };

  function allow(id, max, ms) {
    const now = Date.now();
    const entry = limits.get(id);
    if (!entry || entry.until < now) {
      limits.set(id, { n: 1, until: now + ms });
      if (limits.size > 5000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
      return true;
    }
    return ++entry.n <= max;
  }

  return async function app(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Cookie");
    const url = new URL(req.url || "/", "http://localhost");
    let path = url.pathname;
    const forwarded = url.searchParams.get("__path");
    if (forwarded !== null) {
      path = "/api/" + forwarded.replace(/^\/+/, "");
      url.searchParams.delete("__path");
    }
    path = path.replace(/\/+$/, "") || "/";
    if (path === "/api/auth") {
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
      if (!allow("auth:" + ip, 40, 60_000)) return sendJson(res, 429, { error: "Too many sign-in attempts. Wait a minute and try again." });
      return auth(req, res);
    }
    const candidates = table.filter((r) => r.pattern.test(path));
    const route = candidates.find((r) => r.method === req.method);
    if (!route) {
      if (candidates.length) res.setHeader("Allow", candidates.map((r) => r.method).join(", "));
      return sendJson(res, candidates.length ? 405 : 404, { error: candidates.length ? "Method not allowed." : "Not found." });
    }
    const params = {};
    const m = route.pattern.exec(path);
    try {
      route.names.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
    } catch {
      return sendJson(res, 404, { error: "Not found." });
    }
    if (params.id !== undefined && !(route.idType === "int" ? /^\d{1,9}$/ : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(params.id))
      return sendJson(res, 404, { error: "Not found." });
    const secure = secureCookies(req);
    const ctx = {
      req, res, url, path, params, query: url.searchParams, db, deps, services, secure,
      cookies: [], user: null, publik: null, key: null,
      body: (limit) => readJson(req, limit ?? route.limit ?? 32_000),
    };
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (!allowedOrigins(req).has(req.headers.origin)) fail(403, "This request must come from Sparrow.");
        if (!/^application\/json\b/.test(req.headers["content-type"] || "")) fail(415, "Use application/json.");
      }
      if (route.access !== "public") await authenticate(ctx, route.access);
      else if (db) {
        try {
          ctx.key = sessionKey();
        } catch {}
      }
      const result = await route.handler(ctx);
      if (res.writableEnded) return;
      if (result && result[RESPONSE]) {
        if (ctx.cookies.length) res.setHeader("Set-Cookie", ctx.cookies);
        if (result.raw) {
          res.statusCode = result.status;
          for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
          return res.end(result.body);
        }
        for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
        return sendJson(res, result.status, result.body);
      }
      return sendJson(res, 200, result ?? { ok: true }, ctx.cookies);
    } catch (error) {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message, ...error.extra }, ctx.cookies);
      if (/session encryption|SPARROW_DATA_KEY|PUBLIK_INSTALL_SECRET|PUBLIK_APP_TOKEN/.test(String(error?.message)))
        return sendJson(res, 503, { error: "Sparrow is missing part of its server configuration. Try again later." }, ctx.cookies);
      if (error?.code === "23505") return sendJson(res, 409, { error: "That already exists." }, ctx.cookies);
      console.error("[sparrow]", route.method, route.path, redact(error?.stack || error, 1500));
      return sendJson(res, 500, { error: "Something went wrong on Sparrow's side. Try again in a moment." }, ctx.cookies);
    }
  };

  async function authenticate(ctx, access) {
    if (!db) fail(503, "Sparrow's database is not configured yet.");
    ctx.key = sessionKey();
    const account = readAccount(ctx.req, ctx.key);
    if (!account) fail(401, "Sign in to Sparrow to continue.", { code: "signed_out" });
    const rows = await db.query(
      "select id, email, display_name, session_version, (last_seen_at < now() - interval '1 hour') as stale from app_users where id = $1",
      [account.uid],
    );
    const row = rows[0];
    if (!row || row.session_version !== account.ver) {
      ctx.cookies.push(...clearCookies(ctx.secure));
      fail(401, "Your session ended. Sign in again.", { code: "signed_out" });
    }
    ctx.user = { id: row.id, email: row.email, name: row.display_name, isAdmin: adminEmails().includes(row.email) };
    if (account.expires - Date.now() < 5 * 86_400_000) ctx.cookies.push(accountCookie({ uid: row.id, ver: row.session_version }, ctx.key, ctx.secure));
    if (row.stale) await db.query("update app_users set last_seen_at = now() where id = $1", [row.id]);
    if (!allow("user:" + row.id, 240, 60_000)) fail(429, "Too many requests. Wait a minute and try again.");
    if (access === "app" || access === "admin") {
      const state = await ensureUser(row.id);
      if (state.state !== "claimed")
        fail(428, "Sign in with publik to continue.", { code: "publik_sign_in", state: state.state });
      ctx.publik = state;
      await trackActive(row.id);
    }
    if (access === "admin" && !ctx.user.isAdmin) fail(403, "This area is only for Sparrow reviewers.");
  }
}
