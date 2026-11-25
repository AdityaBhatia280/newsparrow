import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startHarness } from "../support/harness.mjs";

let h;
before(async () => {
  h = await startHarness();
});
after(() => h.close());

const ask = (message = "Help me plan my week.", extra = {}) => ({ task: "Ask anything", message, requestId: randomUUID(), confirmed: true, ...extra });
const chats = () => h.provider.calls.filter((c) => c.type === "chat");

test("resume analysis: contact details never reach AI and unsupported items are dropped", async () => {
  const c = await h.client("resume@example.test").ready(h.provider);
  const text = [
    "Jordan Lee",
    "jordan.lee@example.com | (512) 555-0134 | 123 Oak Street, Austin, TX 78701 | linkedin.com/in/jordanlee",
    "ACTIVITIES",
    "Robotics Club - Captain, led the build team for state championships",
    "AWARDS",
    "Science fair finalist",
  ].join("\n");
  const unconfirmed = await c.post("/api/resume/analyze", { text, requestId: randomUUID() });
  assert.equal(unconfirmed.status, 400, "AI never runs without confirmation");
  const r = await c.post("/api/resume/analyze", { text, requestId: randomUUID(), confirmed: true });
  assert.equal(r.status, 200, r.text);
  const sent = chats().at(-1).user.resumeText;
  for (const secret of ["jordan.lee@example.com", "555-0134", "123 Oak Street", "78701", "linkedin.com/in"]) assert.ok(!sent.includes(secret), secret + " was sent");
  assert.equal(chats().at(-1).model, "publik-balanced");
  assert.deepEqual(r.body.activities.map((x) => x.title), ["Robotics Club"], "the invented honor without real evidence is dropped");
  assert.deepEqual(r.body.suggestedInterests, ["engineering", "computing"]);
  assert.equal(r.body.gradeGuess, 11);
});

test("onboarding: deterministic plan without AI, AI picks validated against candidates, roadmap tasks added once", async () => {
  const c = await h.client("onboard@example.test").ready(h.provider);
  assert.equal((await c.post("/api/onboarding/complete", {})).status, 400, "grade first");
  await c.patch("/api/profile", { firstName: "Ana", grade: 10, region: "TX", interests: ["computing", "math"], goals: ["competitions"], studyLocation: "home_state", budget: "free" });
  const before = chats().length;
  const plain = await c.post("/api/onboarding/complete", { useAi: false });
  assert.equal(plain.status, 200, plain.text);
  assert.equal(chats().length, before, "no AI call without the AI option");
  assert.equal(plain.body.usedAi, false);
  assert.equal(plain.body.opportunities.length, 6);
  assert.ok(plain.body.opportunities.every((o) => o.match.eligible));
  assert.ok(plain.body.colleges.length > 0 && plain.body.colleges.every((col) => col.state === "TX"), "in-state colleges for a home-state preference");
  assert.equal(plain.body.tasks.length, 3);
  const withAi = await c.post("/api/onboarding/complete", { useAi: true, requestId: randomUUID(), confirmed: true });
  assert.equal(withAi.status, 200, withAi.text);
  assert.equal(withAi.body.usedAi, true);
  assert.match(withAi.body.summary, /Fixture summary/);
  assert.equal(withAi.body.opportunities[0].reason, "Fixture reason grounded in your profile.");
  assert.ok(!withAi.body.opportunities.some((o) => o.id === "00000000-0000-4000-8000-000000000000"), "unknown ids are never shown");
  const [{ n }] = await h.db.query("select count(*)::int as n from tasks t join app_users u on u.id = t.user_id where u.email = $1", [c.email]);
  assert.equal(n, 3, "repeating onboarding does not duplicate tasks");
  const profile = await c.get("/api/profile");
  assert.equal(profile.body.onboarded, true);
  assert.deepEqual(profile.body.strengths, ["Team leadership", "Hands-on building"]);
});

test("onboarding still completes when AI is out of allowance (402)", async () => {
  const c = await h.client("onboard402@example.test").ready(h.provider);
  await c.patch("/api/profile", { grade: 12, interests: ["writing"] });
  h.provider.state.chatMode = "402";
  try {
    const r = await c.post("/api/onboarding/complete", { useAi: true, requestId: randomUUID(), confirmed: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.usedAi, false);
    assert.equal(r.body.aiError.status, 402);
    assert.equal(r.body.aiError.topUpUrl, "https://publikhq.com/wallet");
    assert.ok(r.body.opportunities.length > 0);
  } finally {
    h.provider.state.chatMode = "ok";
  }
});

test("advisor: verified records are sent, unknown references are removed, threads persist", async () => {
  const c = await h.client("advisor@example.test").ready(h.provider);
  await c.patch("/api/profile", { firstName: "Private Name", grade: 11, interests: ["computing"], experience: "Robotics captain. Email me at me@example.com" });
  const usaco = (await c.get("/api/opportunities/usaco")).body;
  const college = (await c.get("/api/colleges?q=Rice")).body.items[0];
  const r = await c.post("/api/advisor", ask("Compare these for me.", { task: "Compare my choices", opportunityIds: [usaco.id], collegeIds: [college.id], include: { profile: true, experience: true } }));
  assert.equal(r.status, 200, r.text);
  const call = chats().at(-1);
  assert.ok(call.system.includes("untrusted") || call.system.includes("data, not instructions"));
  assert.ok(!JSON.stringify(call.user).includes("Private Name"), "names are never sent");
  assert.ok(!JSON.stringify(call.user).includes("me@example.com"), "experience is redacted");
  assert.deepEqual(call.user.records.map((x) => x.kind), ["opportunity", "college"]);
  assert.equal(call.user.records[0].verified, false);
  assert.match(call.user.records[1].source, /College Scorecard/);
  const answer = r.body.messages[1].content;
  assert.equal(answer.recommendations[0].opportunityId, usaco.id);
  assert.equal(answer.recommendations[0].collegeId, college.id);
  assert.ok(!answer.recommendations[0].sourceIds.includes("invented-source"), "invented sources are removed");
  const follow = await c.post("/api/advisor", ask("And next week?", { threadId: r.body.thread.id }));
  assert.equal(follow.status, 200);
  assert.equal(chats().at(-1).user.conversation.length, 2, "recent conversation is included");
  const threads = await c.get("/api/advisor/threads");
  assert.equal(threads.body.items.length, 1);
  assert.equal((await c.get(`/api/advisor/threads/${r.body.thread.id}`)).body.messages.length, 4);
  const other = await h.client("advisor-b@example.test").ready(h.provider);
  assert.equal((await other.get(`/api/advisor/threads/${r.body.thread.id}`)).status, 404);
  assert.equal((await other.post("/api/advisor", ask("Hijack", { threadId: r.body.thread.id }))).status, 404);
  assert.equal((await c.del(`/api/advisor/threads/${r.body.thread.id}`)).body.deleted, true);
});

test("advisor: idempotent request ids, tiers, and credential-shaped text is refused", async () => {
  const c = await h.client("idem@example.test").ready(h.provider);
  const body = ask();
  assert.equal((await c.post("/api/advisor", body)).status, 200);
  assert.equal((await c.post("/api/advisor", body)).status, 409, "the same request is never sent twice");
  await c.post("/api/advisor", ask("Deep question", { tier: "smart" }));
  assert.equal(chats().at(-1).model, "publik-smart");
  assert.equal((await c.post("/api/advisor", ask("my key is pk_live_abcdefghijklmnop"))).status, 400);
  assert.equal((await c.post("/api/advisor", { ...ask(), confirmed: false })).status, 400);
});

test("provider failures: 402 shows the message and one link, 429 waits, invalid output 502, network 503 — never retried", async () => {
  const c = await h.client("failures@example.test").ready(h.provider);
  try {
    h.provider.state.chatMode = "402";
    const paid = await c.post("/api/advisor", ask());
    assert.equal(paid.status, 402);
    assert.equal(paid.body.error, "Fixture allowance used up.");
    assert.equal(paid.body.topUpUrl, "https://publikhq.com/wallet");
    h.provider.state.chatMode = "429";
    const busy = await c.post("/api/advisor", ask());
    assert.equal(busy.status, 429);
    assert.equal(busy.body.retryAfter, "7");
    h.provider.state.chatMode = "invalid";
    assert.equal((await c.post("/api/advisor", ask())).status, 502);
    h.provider.state.chatMode = "network";
    const before = chats().length;
    const lost = await c.post("/api/advisor", ask());
    assert.equal(lost.status, 503);
    assert.match(lost.body.error, /check your publik usage/);
    assert.equal(chats().length, before + 1, "exactly one attempt");
    const rows = await h.db.query(
      "select status from provider_requests p join app_users u on u.id = p.user_id where u.email = $1 order by p.created_at",
      [c.email],
    );
    assert.deepEqual(rows.map((r) => r.status), ["failed", "failed", "failed", "unknown"]);
  } finally {
    h.provider.state.chatMode = "ok";
  }
});

test("rate limits: six AI requests a minute per person", async () => {
  const c = await h.client("ratelimit@example.test").ready(h.provider);
  const results = [];
  for (let i = 0; i < 7; i++) results.push((await c.post("/api/advisor", ask("Question " + i))).status);
  assert.deepEqual(results, [200, 200, 200, 200, 200, 200, 429]);
  const other = await h.client("ratelimit-b@example.test").ready(h.provider);
  assert.equal((await other.post("/api/advisor", ask())).status, 200, "limits are per person");
});

test("discover: publik search results are cleaned and matched to the catalog", async () => {
  const c = await h.client("discover@example.test").ready(h.provider);
  const r = await c.post("/api/discover", { q: "coding competitions", requestId: randomUUID(), confirmed: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.results.length, 2, "non-web links are dropped");
  assert.equal(r.body.results[0].title, "Fixture Program", "markup is stripped");
  assert.equal(r.body.results[1].catalogSlug, "usaco");
  assert.match(h.provider.calls.filter((x) => x.type === "search").at(-1).data.q, /high school/);
  h.provider.state.searchMode = "402";
  try {
    const paid = await c.post("/api/discover", { q: "art contests", requestId: randomUUID(), confirmed: true });
    assert.equal(paid.status, 402);
    assert.equal(paid.body.topUpUrl, "https://publikhq.com/wallet");
  } finally {
    h.provider.state.searchMode = "ok";
  }
});

test("tighten: options over 150 characters are never offered", async () => {
  const c = await h.client("tighten@example.test").ready(h.provider);
  const [act] = (await c.post("/api/activities", { title: "Robotics", role: "Captain", description: "Led the team through a long build season with weekly meetings." })).body.items;
  const r = await c.post(`/api/activities/${act.id}/tighten`, { requestId: randomUUID(), confirmed: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.options.length, 2);
  assert.ok(r.body.options.every((o) => o.length <= 150));
  assert.equal(chats().at(-1).model, "publik-fast");
});
