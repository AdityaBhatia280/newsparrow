// Test-only stand-in for the publik API. Imported by tests, never by the application or its bundle.
// It never pretends to be production: every key, URL and answer is marked as a fixture.
import http from "node:http";
import { randomBytes } from "node:crypto";

export async function startMockPublik() {
  const installs = new Map(); // key -> { installId, claimed, plan }
  const minted = new Set();
  const calls = [];
  const state = { chatMode: "ok", claimNew: false, planKind: "plan", searchMode: "ok" };

  function answerFor(system, user) {
    if (system.includes("planning advisor")) {
      const records = user.records || [];
      return {
        summary: "Fixture advisor answer: start with one small project this week.",
        recommendations: [
          {
            title: "Pick one project",
            reason: "A bounded next step fits the time you shared.",
            estimatedMinutes: 30,
            opportunityId: records.find((r) => r.kind === "opportunity")?.id ?? "not-a-real-id",
            collegeId: records.find((r) => r.kind === "college")?.collegeId ?? null,
            sourceIds: [...records.map((r) => r.id), "invented-source"],
            uncertainties: ["Check requirements on the official site."],
          },
        ],
        followUpQuestion: "Which day this week works best?",
        warnings: [],
      };
    }
    if (system.includes("activities and honors from the text of their resume")) {
      const text = user.resumeText || "";
      const line = text.split("\n").find((l) => /robotics/i.test(l)) || text.slice(0, 80);
      return {
        activities: [
          { kind: "activity", category: "Robotics", title: "Robotics Club", role: "Captain", organization: "Fixture High", description: "Led the build team.", grades: [10, 11], hoursPerWeek: 6, weeksPerYear: 30, evidence: line.slice(0, 120) },
          { kind: "honor", title: "Invented National Prize", evidence: "this sentence does not appear in the resume text at all" },
        ],
        skills: ["Python", "CAD"],
        suggestedInterests: ["engineering", "computing", "not-an-interest"],
        gradeGuess: 11,
        summary: "You lead a robotics team.",
        warnings: [],
      };
    }
    if (system.includes("start using Sparrow")) {
      const ids = (user.candidates || []).map((c) => c.id);
      return {
        summary: "Fixture summary: you like building things.",
        strengths: ["Team leadership", "Hands-on building"],
        picks: [...ids.slice(1, 3).map((id) => ({ opportunityId: id, reason: "Fixture reason grounded in your profile." })), { opportunityId: "00000000-0000-4000-8000-000000000000", reason: "Unknown id" }],
        nextSteps: ["Save one opportunity", "Ask a teacher one question"],
      };
    }
    if (system.includes("shorten their own activity description")) {
      return { options: ["Led a 12-person robotics team through build season.", "Captained robotics team; ran weekly build sessions.", "x".repeat(200)] };
    }
    if (system.includes("extract facts about one student opportunity")) {
      const text = user.pageText || "";
      const first = text.split("\n").find((l) => l.length > 40) || text.slice(0, 80);
      return {
        fields: {
          title: { value: user.pageTitle || "Fixture Program", evidence: first.slice(0, 100) },
          type: { value: "program", evidence: first.slice(0, 100) },
          summary: { value: "A fixture program for high school students.", evidence: first.slice(0, 100) },
          deadline: { value: "2001-01-15", evidence: first.slice(0, 100) },
          cost: { value: "free", evidence: "words that are not on the page anywhere" },
        },
        flags: [],
      };
    }
    return { error: "unknown fixture prompt" };
  }

  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const data = raw ? JSON.parse(raw) : {};
    const key = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const json = (status, value, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/v1/installs") {
      calls.push({ type: "install", data });
      if (data.app_token !== "pat_fixture_only" || data.os !== "web") return json(400, { error: { type: "invalid_request", message: "Fixture install refused." } });
      if (minted.has(data.install_id)) return json(200, { install_id: data.install_id });
      minted.add(data.install_id);
      const k = "pk_fixture_" + randomBytes(12).toString("hex");
      installs.set(k, { installId: data.install_id, claimed: state.claimNew, plan: state.planKind });
      return json(201, { key: k, install_id: data.install_id, base_url: origin + "/api/v1", claim_url: "https://publikhq.com/fixture-claim" });
    }
    const person = installs.get(key);
    if (!person) return json(401, { error: { type: "invalid_api_key", message: "Invalid fixture credential." } });
    if (req.url === "/api/v1/wallet") {
      return json(200, {
        claim_state: person.claimed ? "claimed" : "anonymous",
        claim_url: "https://publikhq.com/fixture-claim",
        plan: person.plan === "none" ? { kind: "none", label: null } : { kind: "plan", label: "Fixture plan" },
        balance_micros: person.plan === "none" ? 0 : 100,
        remaining_percent: 84,
        prepaid_remaining_percent: null,
        ai_providers: ["Fixture provider"],
        top_up_url: "https://publikhq.com/wallet",
      });
    }
    if (req.url === "/api/v1/telemetry") {
      calls.push({ type: "telemetry", installId: person.installId, data });
      return json(200, { ok: true });
    }
    if (req.url === "/api/v1/search") {
      calls.push({ type: "search", installId: person.installId, data });
      if (state.searchMode === "402") return json(402, { error: { type: "insufficient_credit", message: "Fixture search allowance used up.", top_up_url: "https://publikhq.com/wallet" } });
      return json(200, {
        results: [
          { url: "https://www.example.org/fixture-program", title: "Fixture <b>Program</b>", snippet: "A fixture result for tests.", site: "example.org" },
          { url: "https://usaco.org/", title: "USACO", snippet: "Catalog match fixture.", site: "usaco.org" },
          { url: "javascript:alert(1)", title: "Bad", snippet: "Rejected", site: "x" },
        ],
      }, { "x-publik-request-id": "fixture-search" });
    }
    if (req.url === "/api/v1/chat/completions") {
      const system = data.messages?.[0]?.content || "";
      let user = {};
      try {
        user = JSON.parse(data.messages?.[1]?.content || "{}");
      } catch {}
      calls.push({ type: "chat", installId: person.installId, key, model: data.model, system, user });
      const headers = { "x-publik-request-id": "fixture-request" };
      if (state.chatMode === "402") return json(402, { error: { type: "insufficient_credit", message: "Fixture allowance used up.", top_up_url: "https://publikhq.com/wallet" } }, headers);
      if (state.chatMode === "429") return json(429, { error: { type: "rate_limit_exceeded", message: "Fixture is busy." } }, { ...headers, "retry-after": "7" });
      if (state.chatMode === "network") return res.destroy();
      const content = state.chatMode === "invalid" ? "not json at all" : JSON.stringify(answerFor(system, user));
      return json(200, { choices: [{ message: { content } }] }, headers);
    }
    json(404, { error: { message: "Fixture route unavailable." } });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  process.env.PUBLIK_ORIGIN = origin;
  process.env.PUBLIK_APP_TOKEN = "pat_fixture_only";
  return {
    origin,
    state,
    calls,
    installs,
    claimAll() {
      for (const p of installs.values()) p.claimed = true;
    },
    setPlan(kind) {
      state.planKind = kind;
      for (const p of installs.values()) p.plan = kind;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
