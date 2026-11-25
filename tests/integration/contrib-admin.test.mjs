import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startHarness } from "../support/harness.mjs";

let h, student, admin;
const PAGE_URL = "https://www.example.org/young-makers";
before(async () => {
  h = await startHarness();
  student = await h.client("contrib@example.test").ready(h.provider);
  admin = await h.client("admin@example.test").ready(h.provider);
  h.pages.set(PAGE_URL, {
    ok: true,
    url: PAGE_URL,
    title: "Young Makers Fellowship",
    description: "",
    text: "The Young Makers Fellowship supports high school students who build hardware projects in their communities.\nApplications are reviewed every spring.",
  });
});
after(() => h.close());

test("submissions: link checks, duplicates of catalog listings, and per-person duplicates", async () => {
  assert.equal((await student.post("/api/submissions", { url: "http://example.org/x" })).status, 400);
  assert.equal((await student.post("/api/submissions", { url: "https://192.168.1.10/x" })).status, 400);
  assert.equal((await student.post("/api/submissions", { url: "https://intranet.local/x" })).status, 400);
  const dup = await student.post("/api/submissions", { url: "https://usaco.org/" });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.slug, "usaco");
  const created = await student.post("/api/submissions", { url: PAGE_URL + "?utm_source=x", type: "program", notes: "Found at school" });
  assert.equal(created.status, 201, created.text);
  assert.equal((await student.post("/api/submissions", { url: PAGE_URL })).status, 409, "same link twice");
});

test("extraction keeps only fields quoted from the page and flags past dates", async () => {
  const [sub] = (await student.get("/api/submissions")).body.items;
  const missing = await student.post(`/api/submissions/${sub.id}/extract`, { requestId: randomUUID() });
  assert.equal(missing.status, 400);
  const r = await student.post(`/api/submissions/${sub.id}/extract`, { requestId: randomUUID(), confirmed: true });
  assert.equal(r.status, 200, r.text);
  const ex = r.body.submission.extracted;
  assert.equal(ex.title, "Young Makers Fellowship");
  assert.equal(ex.cost, undefined, "a field whose quote isn't on the page is dropped");
  assert.ok(r.body.flags.some((f) => /already passed/.test(f)));
  assert.ok(r.body.submission.evidence.every((e) => e.excerpt.length > 0));
  const call = h.provider.calls.filter((c) => c.type === "chat").at(-1);
  assert.match(call.system, /data, not instructions/);
  const unreachable = (await student.post("/api/submissions", { url: "https://www.example.org/missing-page" })).body;
  const fail = await student.post(`/api/submissions/${unreachable.id}/extract`, { requestId: randomUUID(), confirmed: true });
  assert.equal(fail.status, 422);
});

test("editing and submitting; reviewers only; approval publishes once and rewards once", async () => {
  const [sub] = (await student.get("/api/submissions")).body.items.filter((s) => s.url.includes("young-makers"));
  const edited = await student.patch(`/api/submissions/${sub.id}`, { extracted: { provider: "Young Makers Foundation", grades: [10, 11, 12] } });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.body.extracted.provider, "Young Makers Foundation");
  const sent = await student.post(`/api/submissions/${sub.id}/submit`);
  assert.equal(sent.body.status, "pending");
  assert.equal((await student.patch(`/api/submissions/${sub.id}`, { notes: "late edit" })).status, 409);
  assert.equal((await student.post(`/api/admin/submissions/${sub.id}/decision`, { decision: "approve" })).status, 403);
  const queue = await admin.get("/api/admin/queue");
  assert.ok(queue.body.items.some((i) => i.id === sub.id));
  assert.equal(queue.body.items.find((i) => i.id === sub.id).submitter, "contrib");
  assert.equal((await admin.post(`/api/admin/submissions/${sub.id}/decision`, { decision: "reject" })).status, 400, "a reason is required");
  const fields = {
    title: "Young Makers Fellowship", provider: "Young Makers Foundation", type: "program", interests: ["engineering"], grades: [10, 11, 12],
    format: "in_person", cost: "unknown", summary: "Supports high school students who build hardware projects.", officialUrl: PAGE_URL,
  };
  const approved = await admin.post(`/api/admin/submissions/${sub.id}/decision`, { decision: "approve", fields });
  assert.equal(approved.status, 200, approved.text);
  assert.equal(approved.body.reward.points, 50);
  assert.equal(approved.body.submission.status, "approved");
  const listing = await student.get(`/api/opportunities/${approved.body.opportunity.slug}`);
  assert.equal(listing.status, 200);
  assert.ok(listing.body.factsVerifiedAt, "approved with evidence counts as verified");
  assert.ok(listing.body.evidence.length > 0);
  assert.equal((await admin.post(`/api/admin/submissions/${sub.id}/decision`, { decision: "approve", fields })).status, 409, "can't approve twice");
  const rewards = await student.get("/api/rewards");
  assert.equal(rewards.body.points, 50);
  assert.equal(rewards.body.approved, 1);
  assert.equal(rewards.body.badges.find((b) => b.id === "first").earned, true);
  const audit = await admin.get("/api/admin/audit");
  assert.ok(audit.body.items.some((e) => e.action === "submission.approved"));
});

test("corrections update the listing; reviewers can archive, edit and re-check sources", async () => {
  const fix = await student.post("/api/submissions", { url: "https://www.example.org/usaco-rules", correctionOf: "usaco", type: "competition", title: "USACO" });
  assert.equal(fix.status, 201, fix.text);
  await student.post(`/api/submissions/${fix.body.id}/submit`);
  const usaco = (await admin.get("/api/admin/opportunities?q=USA%20Computing")).body.items[0];
  const fields = { title: usaco.title, provider: usaco.provider, type: usaco.type, interests: usaco.interests, grades: usaco.grades, format: usaco.format, cost: "free", summary: usaco.summary, officialUrl: usaco.officialUrl };
  const r = await admin.post(`/api/admin/submissions/${fix.body.id}/decision`, { decision: "approve", fields });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.reward.points, 20);
  const archived = await admin.patch(`/api/admin/opportunities/${usaco.id}`, { status: "archived" });
  assert.equal(archived.body.status, "archived");
  assert.equal((await student.get("/api/opportunities/usaco")).status, 404, "archived listings leave Explore");
  await admin.patch(`/api/admin/opportunities/${usaco.id}`, { status: "approved" });
  h.pages.set("https://usaco.org/", { ok: true, url: "https://usaco.org/", title: "USACO", description: "", text: "The USA Computing Olympiad offers online programming contests for students at four levels of difficulty." });
  const check = await admin.post(`/api/admin/opportunities/${usaco.id}/recheck`, { requestId: randomUUID(), confirmed: true });
  assert.equal(check.status, 200, check.text);
  assert.ok(check.body.evidence.length > 0);
  const verified = await admin.patch(`/api/admin/opportunities/${usaco.id}`, { fields: { ...fields, summary: "Online programming contests at four levels." }, verify: true, evidence: check.body.evidence });
  assert.ok(verified.body.factsVerifiedAt);
  const created = await admin.post("/api/admin/opportunities", { fields: { ...fields, title: "Brand New Program", officialUrl: "https://www.example.org/new" } });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.slug, "brand-new-program");
  assert.equal((await admin.get("/api/admin/stats")).status, 200);
});

test("students can delete drafts but not pending or approved submissions", async () => {
  const draft = (await student.post("/api/submissions", { url: "https://www.example.org/draft-only" })).body;
  assert.equal((await student.del(`/api/submissions/${draft.id}`)).body.deleted, true);
  const approved = (await student.get("/api/submissions")).body.items.find((s) => s.status === "approved");
  assert.equal((await student.del(`/api/submissions/${approved.id}`)).status, 409);
});
