import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "../support/harness.mjs";

let h, a, b;
before(async () => {
  h = await startHarness();
  a = await h.client("data-a@example.test").ready(h.provider);
  b = await h.client("data-b@example.test").ready(h.provider);
});
after(() => h.close());

test("profile: validated partial updates, array dedupe, settings merge and tour flag", async () => {
  assert.equal((await a.patch("/api/profile", { grade: 13 })).status, 400);
  assert.equal((await a.patch("/api/profile", { interests: ["computing", "not-real"] })).status, 400);
  assert.equal((await a.patch("/api/profile", { surprise: true })).status, 400);
  const p = await a.patch("/api/profile", {
    firstName: "Maya", grade: 11, region: "TX", persona: "building", interests: ["computing", "engineering", "computing"],
    goals: ["competitions", "research"], weeklyHours: 6, budget: "free", format: "virtual", studyLocation: "home_state", onboardingStep: 3,
  });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual(p.body.interests, ["computing", "engineering"]);
  assert.equal(p.body.onboardingStep, 3);
  await a.patch("/api/profile", { settings: { effects: "off" } });
  const done = await a.patch("/api/profile", { tourDone: true });
  assert.equal(done.body.tourDone, true);
  assert.equal(done.body.settings.effects, "off");
  assert.equal((await b.get("/api/profile")).body.firstName, null, "profiles are per person");
});

test("activities: Common App limits, bulk import, reorder and ownership", async () => {
  const long = await a.post("/api/activities", { title: "Club", description: "x".repeat(151) });
  assert.equal(long.status, 400);
  assert.match(long.body.error, /150/);
  const created = await a.post("/api/activities", {
    items: [
      { kind: "activity", title: "Robotics Club", role: "Captain", description: "Led build season.", grades: [10, 11], source: "resume" },
      { kind: "honor", title: "Science fair finalist", recognition: "state_regional", grades: [11] },
    ],
  });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.items.length, 2);
  const many = Array.from({ length: 10 }, (_, i) => ({ title: "Activity " + i }));
  assert.equal((await a.post("/api/activities", { items: many })).status, 400, "no more than 10 activities");
  const [robotics] = created.body.items;
  assert.equal((await b.patch(`/api/activities/${robotics.id}`, { title: "Mine now" })).status, 404, "another person can't edit it");
  assert.equal((await b.del(`/api/activities/${robotics.id}`)).status, 404);
  const patched = await a.patch(`/api/activities/${robotics.id}`, { hoursPerWeek: 6, weeksPerYear: 30 });
  assert.equal(patched.body.hoursPerWeek, 6);
  const list = await a.get("/api/activities");
  assert.equal(list.body.items.length, 2);
  assert.equal((await b.get("/api/activities")).body.items.length, 0);
});

test("explore: filters, match scores, detail with similar items, and ownership of saved items", async () => {
  const all = await a.get("/api/opportunities");
  assert.equal(all.status, 200);
  assert.ok(all.body.total >= 70, "the curated catalog is loaded");
  assert.ok(all.body.items[0].match.score >= all.body.items[1].match.score, "sorted by match");
  const computing = await a.get("/api/opportunities?interest=computing&type=competition");
  assert.ok(computing.body.items.length > 0);
  assert.ok(computing.body.items.every((o) => o.interests.includes("computing") && o.type === "competition"));
  const searched = await a.get("/api/opportunities?q=" + encodeURIComponent("USA Computing"));
  assert.equal(searched.body.items[0].slug, "usaco");
  assert.equal((await a.get("/api/opportunities?grade=15")).status, 400);
  const detail = await a.get("/api/opportunities/usaco");
  assert.equal(detail.body.title, "USA Computing Olympiad");
  assert.ok(Array.isArray(detail.body.similar) && detail.body.similar.length > 0);
  assert.equal(detail.body.factsVerifiedAt, null, "seeded listings are not marked verified");
  assert.equal((await a.get("/api/opportunities/not-a-listing")).status, 404);

  const saved = await a.post("/api/saved", { opportunityId: detail.body.id });
  assert.equal(saved.status, 201, saved.text);
  const again = await a.post("/api/saved", { opportunityId: detail.body.id });
  assert.equal(again.body.id, saved.body.id, "saving twice is idempotent");
  assert.equal((await a.get("/api/opportunities/usaco")).body.saved.id, saved.body.id);
  const patched = await a.patch(`/api/saved/${saved.body.id}`, { status: "preparing", note: "Practice Bronze", personalDue: "2027-01-10" });
  assert.equal(patched.status, 200, patched.text);
  assert.equal(patched.body.status, "preparing");
  assert.equal(patched.body.personalDue, "2027-01-10");
  assert.equal((await a.patch(`/api/saved/${saved.body.id}`, { personalDue: null })).body.personalDue, null);
  assert.equal((await b.patch(`/api/saved/${saved.body.id}`, { status: "closed" })).status, 404);
  assert.equal((await b.del(`/api/saved/${saved.body.id}`)).status, 404);
  const personal = await a.post("/api/saved", { title: "Local library teen board", url: "https://library.example.org/teens" });
  assert.equal(personal.status, 201);
  assert.equal(personal.body.opportunity, null);
  assert.equal((await a.post("/api/saved", { title: "Bad link", url: "http://127.0.0.1/x" })).status, 400);
});

test("tasks: create, complete, attach to saved items, roadmap steps, and ownership", async () => {
  const saved = (await a.get("/api/saved")).body.items[0];
  const t = await a.post("/api/tasks", { title: "Read the rules", due: "2027-01-05", savedId: saved.id });
  assert.equal(t.status, 201, t.text);
  assert.equal(t.body.savedTitle, saved.title);
  assert.equal((await b.post("/api/tasks", { title: "Sneaky", savedId: saved.id })).status, 404, "can't attach to someone else's item");
  const done = await a.patch(`/api/tasks/${t.body.id}`, { done: true });
  assert.equal(done.body.done, true);
  assert.equal((await a.patch(`/api/tasks/${t.body.id}`, { done: false })).body.done, false);
  assert.equal((await b.patch(`/api/tasks/${t.body.id}`, { done: true })).status, 404);
  const step = await a.post("/api/tasks", { title: "ignored", planKey: "roadmap:11:fall:0" });
  assert.equal(step.status, 201);
  assert.equal(step.body.title, "Take the PSAT/NMSQT if your school offers it");
  const repeat = await a.post("/api/tasks", { title: "ignored", planKey: "roadmap:11:fall:0" });
  assert.equal(repeat.body.id, step.body.id, "roadmap steps are added once");
  assert.equal((await a.post("/api/tasks", { title: "x", planKey: "roadmap:11:fall:9" })).status, 400);
  const roadmap = await a.get("/api/roadmap");
  assert.ok(roadmap.body.added["roadmap:11:fall:0"]);
  const saved2 = (await a.get("/api/saved")).body.items.find((i) => i.id === saved.id);
  assert.equal(saved2.tasks.length, 1, "saved items include their tasks");
  assert.equal((await b.get("/api/tasks")).body.items.length, 0);
});

test("calendar export is a valid iCalendar file with the person's own dates only", async () => {
  const r = await a.get("/api/calendar.ics");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/calendar/);
  assert.match(r.text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(r.text, /SUMMARY:Read the rules/);
  assert.match(r.text, /DTSTART;VALUE=DATE:20270105/);
  assert.ok(!(await b.get("/api/calendar.ics")).text.includes("Read the rules"));
});

test("colleges: real Scorecard data, filters, shortlist with notes and tags, ownership", async () => {
  const list = await a.get("/api/colleges?state=TX");
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length > 0 && list.body.items.every((c) => c.state === "TX"));
  assert.equal(list.body.source.name, "U.S. Department of Education College Scorecard");
  const rice = list.body.items.find((c) => c.name === "Rice University") || (await a.get("/api/colleges?q=Rice")).body.items[0];
  const detail = await a.get(`/api/colleges/${rice.id}`);
  assert.equal(detail.body.name, "Rice University");
  assert.ok(detail.body.programs.length > 0);
  assert.match(detail.body.scorecardUrl, /collegescorecard\.ed\.gov/);
  assert.equal((await a.get("/api/colleges/999999999")).status, 404);
  assert.equal((await a.get("/api/colleges/abc")).status, 404);
  const put = await a.put(`/api/shortlist/${rice.id}`, { tag: "top_choice", note: "Ask about research" });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.body.shortlist.tag, "top_choice");
  assert.equal((await a.put(`/api/shortlist/${rice.id}`, { tag: "chance_me" })).status, 400, "no odds-style labels");
  assert.equal((await a.get("/api/shortlist")).body.items.length, 1);
  assert.equal((await b.get("/api/shortlist")).body.items.length, 0);
  assert.equal((await b.del(`/api/shortlist/${rice.id}`)).status, 404);
  const cheap = await a.get("/api/colleges?maxNet=15000&control=public");
  assert.ok(cheap.body.items.every((c) => c.netPrice <= 15000));
});

test("home brings the plan together", async () => {
  const home = await a.get("/api/home");
  assert.equal(home.status, 200);
  assert.ok(home.body.counts.saved >= 2);
  assert.equal(home.body.counts.colleges, 1);
  assert.ok(home.body.upNext.length >= 1);
  assert.ok(home.body.forYou.length > 0);
  assert.ok(home.body.forYou.every((o) => !o.saved), "for-you excludes saved items");
});

test("export includes the person's data and no credentials", async () => {
  const r = await a.get("/api/export");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition"), /sparrow-data\.json/);
  const data = JSON.parse(r.text);
  assert.equal(data.profile.first_name, "Maya");
  assert.ok(data.activities.length === 2 && data.saved.length >= 2);
  assert.ok(!r.text.includes("pk_") && !r.text.includes("key_enc"));
});
