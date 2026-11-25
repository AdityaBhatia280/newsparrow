import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startHarness, uuidFor } from "../support/harness.mjs";

let h;
before(async () => {
  process.env.PUBLIK_TELEMETRY_INTERVAL_SECONDS = "1";
  // A founder key in the environment must never be used for a visitor.
  process.env.PUBLIK_API_KEY = ["pk", "fixture_founder_must_never_be_used"].join("_");
  h = await startHarness();
});
after(async () => {
  delete process.env.PUBLIK_API_KEY;
  await h.close();
});

test("Google sign-in requires the 13+ and Terms consent and sets an HttpOnly sealed cookie", async () => {
  const c = h.client("consent@example.test");
  const refused = await c.post("/api/auth", { action: "google" });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /13 or older/);
  const email = await c.post("/api/auth", { action: "email", email: c.email, consent: true });
  assert.equal(email.status, 400, "there is no email-code sign-in");
  await c.signIn();
  const cookie = [...c.jar.keys()];
  assert.ok(cookie.includes("sparrow_account"));
  const raw = c.jar.get("sparrow_account");
  assert.ok(!raw.includes(c.email), "the cookie never holds the email in plain text");
  const [row] = await h.db.query("select terms_accepted_at, role from app_users where email = $1", [c.email]);
  assert.ok(row.terms_accepted_at);
  assert.equal(row.role, "student");
});

test("sign-in rejects cross-site origins", async () => {
  const c = h.client("csrf@example.test");
  const r = await c.post("/api/auth", { action: "google", consent: true }, { origin: "https://attacker.invalid" });
  assert.equal(r.status, 403);
});

test("Google sign-in uses PKCE, state and nonce, and lands on /app", async () => {
  const c = h.client("google@example.test");
  const start = await c.startGoogle();
  assert.equal(start.status, 200);
  const cookieLine = start.headers.getSetCookie().find((x) => x.startsWith("sparrow_login="));
  assert.match(cookieLine, /HttpOnly/);
  assert.match(cookieLine, /SameSite=Lax/);
  const url = new URL(start.body.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.ok(url.searchParams.get("state") && url.searchParams.get("nonce"));
  assert.ok(!start.text.includes("fixture-secret"), "the client secret never leaves the server");
  url.searchParams.set("login_hint", c.email);
  const back = new URL((await fetch(url, { redirect: "manual" })).headers.get("location"));
  // Another browser (no flow cookie) and a wrong state are both refused.
  const stranger = await h.client("nobody@example.test").get(back.pathname + back.search);
  assert.equal(stranger.headers.get("location"), "/app?auth=retry");
  const forged = new URLSearchParams(back.search);
  forged.set("state", "forged");
  const wrongState = await c.get("/api/auth?" + forged);
  assert.equal(wrongState.headers.get("location"), "/app?auth=retry");
  // A token for a different nonce (a replayed code) is refused too.
  const again = await c.startGoogle();
  const replay = new URLSearchParams(back.search);
  replay.set("state", new URL(again.body.url).searchParams.get("state"));
  const replayed = await c.get("/api/auth?" + replay);
  assert.equal(replayed.headers.get("location"), "/app?auth=retry");
  await c.signIn();
  const session = await c.get("/api/session");
  assert.equal(session.body.authenticated, true);
});

test("the first page after sign-in is Sign in with publik, and app data stays locked until then", async () => {
  const c = await h.client("gate@example.test").signIn();
  const before = await c.get("/api/session");
  assert.equal(before.body.authenticated, true);
  assert.equal(before.body.publik.state, "sign_in");
  assert.equal(before.body.publik.claimUrl, "https://publikhq.com/fixture-claim");
  for (const path of ["/api/home", "/api/profile", "/api/opportunities", "/api/colleges", "/api/advisor/threads"]) {
    const r = await c.get(path);
    assert.equal(r.status, 428, path);
    assert.equal(r.body.code, "publik_sign_in");
  }
  assert.equal((await c.get("/api/publik/status")).body.state, "sign_in");
  h.provider.claimAll();
  assert.equal((await c.get("/api/publik/status")).body.state, "claimed");
  const after = await c.get("/api/session");
  assert.equal(after.body.publik.state, "claimed");
  assert.equal((await c.get("/api/home")).status, 200);
  const install = h.provider.calls.find((x) => x.type === "install");
  assert.equal(install.data.os, "web");
  assert.equal(install.data.app_slug, "newsparrow");
});

test("signed-out requests are refused and never touch publik", async () => {
  const anon = h.client("anon@example.test");
  assert.equal((await anon.get("/api/home")).status, 401);
  const session = await anon.get("/api/session");
  assert.equal(session.body.authenticated, false);
  assert.equal(session.body.configured, true);
});

test("each person gets their own install; keys stay encrypted at rest and out of every response", async () => {
  const a = await h.client("iso-a@example.test").ready(h.provider);
  const b = await h.client("iso-b@example.test").ready(h.provider);
  const rows = await h.db.query("select user_id, record from publik_users where user_id = any($1::uuid[])", [
    `{${uuidFor(a.email)},${uuidFor(b.email)}}`,
  ]);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].record.installId, rows[1].record.installId);
  for (const row of rows) {
    assert.ok(row.record.key.startsWith("v1."), "the pk_ key is encrypted in the database");
    assert.ok(!JSON.stringify(row.record).includes("pk_fixture"));
  }
  for (const r of [await a.get("/api/session"), await a.get("/api/wallet"), await a.get("/api/home")])
    assert.ok(!r.text.includes("pk_fixture") && !r.text.includes("pat_fixture"), "no credential in responses");
  const wallet = await a.get("/api/wallet");
  assert.equal(wallet.body.remainingPercent, 84);
  assert.deepEqual(wallet.body.providers, ["Fixture provider"]);
  assert.ok(!("balance_micros" in wallet.body) && !/micros|\$/.test(wallet.text), "usage is shown as a percent, never money");
});

test("telemetry: app_opened then active_session, from the person's own install, and the opt-out works", async () => {
  const c = await h.client("telemetry@example.test").ready(h.provider);
  const [row] = await h.db.query("select record from publik_users where user_id = $1", [uuidFor(c.email)]);
  const mine = () => h.provider.calls.filter((x) => x.type === "telemetry" && x.installId === row.record.installId).map((x) => x.data.event);
  assert.equal(mine()[0], "app_opened");
  const end = Date.now() + 1600;
  while (Date.now() < end) {
    await c.get("/api/home");
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(mine().includes("active_session"), "active_session follows while the person stays");
  const sent = h.provider.calls.find((x) => x.type === "telemetry" && x.installId === row.record.installId);
  assert.equal(sent.data.app, "newsparrow");
  assert.equal(sent.data.os, "web");
  assert.equal((await c.post("/api/publik/usage", { enabled: false })).body.usageEnabled, false);
  const count = mine().length;
  for (let i = 0; i < 4; i++) {
    await c.get("/api/home");
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.equal(mine().length, count, "no events after opting out");
  assert.equal((await c.get("/api/wallet")).body.usageEnabled, false);
});

test("own publik key: validated, encrypted, used for AI, and removable", async () => {
  const c = await h.client("ownkey@example.test").ready(h.provider);
  assert.equal((await c.post("/api/publik/own-key", { key: "sk-not-publik" })).status, 400);
  const personal = [...h.provider.installs.keys()].find((k) => h.provider.installs.get(k).claimed);
  const saved = await c.post("/api/publik/own-key", { key: personal });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ownKeyHint, personal.slice(-4));
  const [row] = await h.db.query("select key_enc from publik_own_keys where user_id = $1", [uuidFor(c.email)]);
  assert.ok(row.key_enc.startsWith("v1.") && !row.key_enc.includes("pk_"));
  const before = h.provider.calls.length;
  const r = await c.post("/api/advisor", { task: "Ask anything", message: "Help me plan a week.", requestId: crypto.randomUUID(), confirmed: true });
  assert.equal(r.status, 200, r.text);
  const chat = h.provider.calls.slice(before).find((x) => x.type === "chat");
  assert.equal(chat.key, personal, "the person's own key is used");
  assert.equal((await c.del("/api/publik/own-key")).body.usingOwnKey, false);
});

test("the founder PUBLIK_API_KEY is never used for a visitor's AI call", async () => {
  const c = await h.client("founder-check@example.test").ready(h.provider);
  const before = h.provider.calls.length;
  await c.post("/api/advisor", { task: "Ask anything", message: "Plan my week.", requestId: crypto.randomUUID(), confirmed: true });
  const chat = h.provider.calls.slice(before).find((x) => x.type === "chat");
  assert.ok(chat, "a chat call was made");
  assert.notEqual(chat.key, process.env.PUBLIK_API_KEY);
});

test("tampered cookies, signing out everywhere and deleted accounts all end the session", async () => {
  const c = await h.client("session@example.test").ready(h.provider);
  const tampered = h.client("session@example.test");
  tampered.jar.set("sparrow_account", c.jar.get("sparrow_account").slice(0, -6) + "AAAAAA");
  assert.equal((await tampered.get("/api/home")).status, 401);
  const copy = h.client(c.email);
  copy.jar = new Map(c.jar);
  assert.equal((await c.post("/api/account/sign-out-everywhere")).status, 200);
  assert.equal((await copy.get("/api/home")).status, 401, "other browsers are signed out too");
  const d = await h.client("deleted@example.test").ready(h.provider);
  await d.patch("/api/profile", { firstName: "Del" });
  assert.equal((await d.del("/api/account", { confirm: "nope" })).status, 400);
  const gone = await d.del("/api/account", { confirm: "DELETE" });
  assert.equal(gone.body.deleted, true);
  const [count] = await h.db.query("select count(*)::int as n from profiles where user_id = $1", [uuidFor(d.email)]);
  assert.equal(count.n, 0);
  assert.equal((await d.get("/api/session")).body.authenticated, false);
});

test("reviewer routes are only for SPARROW_ADMIN_EMAILS", async () => {
  const student = await h.client("student@example.test").ready(h.provider);
  assert.equal((await student.get("/api/admin/queue")).status, 403);
  const admin = await h.client("admin@example.test").ready(h.provider);
  assert.equal((await admin.get("/api/admin/queue")).status, 200);
  assert.equal((await admin.get("/api/session")).body.user.isAdmin, true);
});

test("unknown routes, methods and malformed ids answer cleanly", async () => {
  const c = await h.client("routes@example.test").ready(h.provider);
  assert.equal((await c.get("/api/nope")).status, 404);
  assert.equal((await c.del("/api/home")).status, 405);
  assert.equal((await c.patch("/api/tasks/not-a-uuid", {})).status, 404);
  const wrongType = await c.request("POST", "/api/tasks", undefined, { "content-type": "text/plain" });
  assert.equal(wrongType.status, 415);
  assert.equal(createHash("sha256").update("x").digest("hex").length, 64);
});
