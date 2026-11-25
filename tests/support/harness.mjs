// Starts Sparrow against in-process PGlite, a fake Google sign-in and the fake publik API. No external services.
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { userIdFor } from "../../server/auth/google.mjs";
import { startMockPublik } from "./mock-publik.mjs";

/** The Sparrow user ID the fake Google account for this email signs in as. */
export const uuidFor = (email) => userIdFor("fixture-" + email);

export const GOOGLE_CLIENT_ID = "fixture-client.apps.googleusercontent.com";
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");

/**
 * Fake Google: an authorize page that signs in at once (as login_hint, or student@example.test) and redirects back,
 * and a token endpoint that answers an ID token for that code.
 */
export async function startFakeGoogle() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const back = new URL(u.searchParams.get("redirect_uri"));
    back.search = new URLSearchParams({ code: b64({ email: u.searchParams.get("login_hint") || "student@example.test", nonce: u.searchParams.get("nonce") }), state: u.searchParams.get("state") || "" });
    res.writeHead(302, { Location: back.href }).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const authorizeUrl = "http://127.0.0.1:" + server.address().port + "/authorize";
  return { authorizeUrl, close: () => new Promise((r) => server.close(r)) };
}

export async function fakeGoogleToken(url, options = {}) {
  const form = new URLSearchParams(options.body);
  if (form.get("client_secret") !== "fixture-secret" || !form.get("code_verifier")) return Response.json({ error: "invalid_client" }, { status: 401 });
  let grant;
  try {
    grant = JSON.parse(Buffer.from(form.get("code"), "base64url").toString("utf8"));
  } catch {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  const claims = {
    iss: "https://accounts.google.com", aud: GOOGLE_CLIENT_ID, sub: "fixture-" + grant.email, email: grant.email,
    email_verified: true, given_name: grant.email.split("@")[0], nonce: grant.nonce, exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return Response.json({ id_token: [b64({ alg: "RS256" }), b64(claims), "sig"].join(".") });
}

export class Client {
  constructor(origin, email) {
    this.origin = origin;
    this.email = email;
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      if (!value || attrs.some((a) => /max-age=0/i.test(a))) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  async request(method, path, body, headers = {}) {
    const response = await fetch(this.origin + path, {
      method,
      redirect: "manual",
      headers: {
        cookie: this.cookieHeader(),
        ...(method !== "GET" ? { origin: this.origin, "content-type": "application/json" } : {}),
        ...headers,
      },
      body: method !== "GET" && method !== "HEAD" ? JSON.stringify(body ?? {}) : undefined,
    });
    this.absorb(response);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: response.status, body: json, text, headers: response.headers };
  }
  get(path, headers) { return this.request("GET", path, undefined, headers); }
  post(path, body, headers) { return this.request("POST", path, body, headers); }
  patch(path, body) { return this.request("PATCH", path, body); }
  put(path, body) { return this.request("PUT", path, body); }
  del(path, body) { return this.request("DELETE", path, body); }
  /** Continue with Google, following the fake Google page back to /api/auth. */
  async startGoogle(headers) {
    return this.post("/api/auth", { action: "google", consent: true }, headers);
  }
  async signIn() {
    const start = await this.startGoogle();
    if (start.status !== 200) throw new Error("sign-in failed: " + start.text);
    const authorize = new URL(start.body.url);
    authorize.searchParams.set("login_hint", this.email);
    const google = await fetch(authorize, { redirect: "manual" });
    const back = new URL(google.headers.get("location"));
    const done = await this.get(back.pathname + back.search);
    if (done.headers.get("location") !== "/app") throw new Error("Google sign-in failed: " + done.headers.get("location"));
    return this;
  }
  /** Signs in, passes the publik gate and returns the client. */
  async ready(provider) {
    await this.signIn();
    await this.get("/api/session");
    provider.claimAll();
    const s = await this.get("/api/session");
    if (s.body?.publik?.state !== "claimed") throw new Error("publik gate did not pass: " + s.text);
    return this;
  }
}

export async function startHarness({ seedColleges = 80 } = {}) {
  const provider = await startMockPublik();
  Object.assign(process.env, {
    NODE_ENV: "test",
    SPARROW_SESSION_SECRET: randomBytes(48).toString("base64url"),
    SPARROW_DATA_KEY: randomBytes(32).toString("hex"),
    PUBLIK_INSTALL_SECRET: randomBytes(32).toString("hex"),
    SPARROW_ADMIN_EMAILS: "admin@example.test",
  });
  delete process.env.SPARROW_AUTH_ORIGIN;
  const { PGlite } = await import("@electric-sql/pglite");
  const { createPgliteDriver, migrate } = await import("../../server/db/index.mjs");
  const { readSeed, seedColleges: loadColleges, seedOpportunities } = await import("../../server/db/seed.mjs");
  const db = createPgliteDriver(new PGlite());
  await migrate(db);
  await seedOpportunities(db, (await readSeed("opportunities.json")).items);
  const colleges = await readSeed("colleges.json");
  const subset = [
    ...colleges.colleges.filter((c) => ["Rice University", "The University of Texas at Austin", "Stanford University"].includes(c.name)),
    ...colleges.colleges.filter((c) => c.state === "TX").slice(0, seedColleges / 2),
    ...colleges.colleges.slice(0, seedColleges / 2),
  ];
  await loadColleges(db, { ...colleges, colleges: [...new Map(subset.map((c) => [c.id, c])).values()] });
  const pages = new Map();
  const google = await startFakeGoogle();
  const { createServer } = await import("../../server/local.mjs");
  const server = createServer({
    db,
    auth: {
      configuration: (req) => ({
        origin: "http://" + req.headers.host,
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: "fixture-secret",
        authorizeUrl: google.authorizeUrl,
        tokenUrl: "https://oauth2.fixture.invalid/token",
      }),
      request: fakeGoogleToken,
    },
    fetchPage: async (url) => pages.get(url) ?? { ok: false, reason: "Sparrow couldn't reach that page." },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  return {
    origin,
    db,
    provider,
    pages,
    server,
    client: (email) => new Client(origin, email),
    async close() {
      await new Promise((r) => server.close(r));
      await provider.close();
      await google.close();
      await db.end();
    },
  };
}
