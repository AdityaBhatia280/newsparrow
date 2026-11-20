// Test-only provider. Imported by tests, never by the application or its public bundle.
import http from "node:http";
import { randomBytes } from "node:crypto";
export async function startMockProvider({ claimed = false } = {}) {
  const installs = new Map(),
    calls = [],
    state = { chatMode: "ok", claimed };
  const answer = {
    summary: "Test-only planning response.",
    recommendations: [
      {
        title: "Choose a small project",
        reason: "A bounded next step fits the time you provided.",
        estimatedMinutes: 30,
        opportunityId: null,
        sourceIds: [],
        uncertainties: ["Check real requirements before applying."],
      },
    ],
    followUpQuestion: null,
    warnings: [],
  };
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const data = raw ? JSON.parse(raw) : {},
      key = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const json = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/v1/installs") {
      const id = data.install_id,
        k = ["pk", "fixture", id.replaceAll("-", "")].join("_");
      installs.set(k, {
        id,
        claimed: state.claimed,
        handle: "test-" + installs.size,
      });
      return json(201, {
        key: k,
        install_id: id,
        base_url: origin + "/api/v1",
        claim_url: "https://publikhq.com/fixture-claim",
      });
    }
    const person = installs.get(key);
    if (!person)
      return json(401, { error: { message: "Invalid fixture credential." } });
    if (req.url === "/api/v1/wallet")
      return json(200, {
        claim_state: person.claimed ? "claimed" : "anonymous",
        claim_url: "https://publikhq.com/fixture-claim",
        account: { handle: person.handle },
        plan: { kind: "plan", label: "Fixture plan" },
        balance_micros: 100,
        remaining_percent: 84,
        prepaid_remaining_percent: null,
        ai_providers: ["Test-only provider"],
        top_up_url: "https://publikhq.com/wallet",
      });
    if (req.url === "/api/v1/telemetry") {
      calls.push({ type: "telemetry", id: person.id, data });
      return json(200, { ok: true });
    }
    if (req.url === "/api/v1/chat/completions") {
      calls.push({ type: "chat", id: person.id, data });
      res.setHeader("x-publik-request-id", "fixture-request");
      if (state.chatMode === "402")
        return json(402, {
          error: {
            message: "Fixture allowance exhausted.",
            top_up_url: "https://publikhq.com/wallet",
          },
        });
      if (state.chatMode === "network") {
        res.destroy();
        return;
      }
      const content =
        state.chatMode === "invalid"
          ? {
              ...answer,
              recommendations: [
                {
                  ...answer.recommendations[0],
                  sourceIds: ["invented-source"],
                },
              ],
            }
          : answer;
      return json(200, {
        choices: [{ message: { content: JSON.stringify(content) } }],
      });
    }
    json(404, { error: { message: "Fixture route unavailable." } });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  process.env.NODE_ENV = "test";
  process.env.PUBLIK_ORIGIN = origin;
  process.env.PUBLIK_APP_TOKEN = ["pat", "fixture_only"].join("_");
  process.env.SPARROW_SESSION_SECRET = randomBytes(48).toString("base64url");
  return {
    state,
    installs,
    calls,
    origin,
    answer,
    claimAll() {
      for (const p of installs.values()) p.claimed = true;
      state.claimed = true;
    },
    close() {
      return new Promise((r) => server.close(r));
    },
  };
}
