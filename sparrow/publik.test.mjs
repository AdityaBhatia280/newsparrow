import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startMockProvider } from "./test-support/mock-provider.mjs";

test("hosted publik isolation, gate, CSRF, telemetry, advisor validation, and failures", async () => {
  const provider = await startMockProvider();
  // A founder override must never replace an authenticated visitor's credential.
  process.env.PUBLIK_API_KEY = ["pk", "fixture_founder_must_not_be_used"].join(
    "_",
  );
  const { createServer } = await import("./server.mjs");
  const { principal, sessionKey } = await import("../server/session.mjs");
  assert.equal(
    principal(
      { install_id: "first" },
      { account: { handle: "same-account" } },
      sessionKey(),
    ),
    principal(
      { install_id: "later" },
      { account: { handle: "same-account" } },
      sessionKey(),
    ),
  );
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const a = { cookie: "" },
    b = { cookie: "" };
  async function request(payload, jar = a, extra = {}) {
    const response = await fetch(origin + "/api/publik", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...extra,
      },
      body: JSON.stringify(payload),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) jar.cookie = cookie.split(";")[0];
    return { status: response.status, body: await response.json(), cookie };
  }
  const draft = () => ({
    task: "Build a realistic plan",
    draft: "Help me plan a small community project.",
    profile: {
      grade: "11",
      interests: ["Computing"],
      weeklyHours: 3,
      goals: [],
    },
    requestId: randomUUID(),
    confirmed: true,
  });
  try {
    assert.equal(
      (await request({ action: "advisor", request: draft() })).status,
      401,
    );
    const pending = await request({ action: "status" });
    assert.equal(pending.body.authenticated, false);
    assert.equal(pending.body.screen.id, "sign_in");
    assert.ok(pending.cookie.includes("HttpOnly"));
    assert.ok(pending.cookie.includes("SameSite=Lax"));
    assert.ok(!pending.cookie.includes(["pk", "fixture"].join("_")));
    assert.ok(
      !JSON.stringify(pending.body).includes(["pk", "fixture"].join("_")),
    );
    assert.equal(
      (
        await request({ action: "status" }, a, {
          origin: "https://attacker.invalid",
        })
      ).status,
      403,
    );
    provider.claimAll();
    const choose = await request({ action: "status" });
    assert.equal(choose.body.screen.id, "choose");
    const ready = await request({ action: "choice", choice: "publik" });
    assert.equal(ready.body.authenticated, true);
    await request({ action: "open" });
    await request({ action: "active" });
    assert.deepEqual(
      provider.calls
        .filter((c) => c.type === "telemetry")
        .map((c) => c.data.event),
      ["app_opened", "active_session"],
    );
    await request({ action: "status" }, b);
    await request({ action: "choice", choice: "publik" }, b);
    const other = await request({ action: "status" }, b);
    assert.notEqual(other.body.principal, ready.body.principal);
    const both = await Promise.all([
      request({ action: "status" }, a),
      request({ action: "status" }, b),
    ]);
    assert.equal(both[0].body.principal, ready.body.principal);
    assert.equal(both[1].body.principal, other.body.principal);
    const personalChoice = await request(
      { action: "choice", choice: "own_key" },
      b,
    );
    assert.equal(personalChoice.body.providerReady, false);
    const personal = [...provider.installs.keys()][1];
    assert.equal(
      (await request({ action: "own_key", key: personal }, b)).body
        .providerReady,
      true,
    );
    assert.equal(
      (await request({ action: "advisor", request: draft() }, b)).status,
      200,
    );
    const personalCall = provider.calls.find((c) => c.type === "chat");
    assert.equal(personalCall.id, [...provider.installs.values()][1].id);
    provider.calls.splice(provider.calls.indexOf(personalCall), 1);
    const sealedA = a.cookie;
    const tampered = { cookie: sealedA.slice(0, -8) + "xxxxxxxx" };
    assert.equal(
      (await request({ action: "advisor", request: draft() }, tampered)).status,
      401,
    );
    const operation = draft(),
      success = await request({ action: "advisor", request: operation });
    assert.equal(success.status, 200);
    assert.deepEqual(success.body.answer, provider.answer);
    assert.equal(
      (await request({ action: "advisor", request: operation })).status,
      409,
    );
    const chat = provider.calls.find((c) => c.type === "chat");
    assert.equal(
      chat.id,
      provider.calls.find((c) => c.type === "telemetry").id,
    );
    assert.equal(chat.data.model, "publik-balanced");
    assert.ok(chat.data.messages[0].content.includes("untrusted data"));
    assert.deepEqual(
      JSON.parse(chat.data.messages[1].content).verifiedRecords,
      [],
    );
    assert.equal(
      (
        await request({
          action: "advisor",
          request: { ...draft(), confirmed: false },
        })
      ).status,
      400,
    );
    provider.state.chatMode = "402";
    const failed = await request({ action: "advisor", request: draft() });
    assert.equal(failed.status, 402);
    assert.equal(failed.body.topUpUrl, "https://publikhq.com/wallet");
    provider.state.chatMode = "invalid";
    assert.equal(
      (await request({ action: "advisor", request: draft() })).status,
      502,
    );
    provider.state.chatMode = "network";
    assert.equal(
      (await request({ action: "advisor", request: draft() })).status,
      503,
    );
    await request({ action: "usage", enabled: false });
    await request({ action: "active" });
    assert.equal(
      provider.calls.filter((c) => c.type === "telemetry").length,
      2,
    );
    await request({ action: "sign_out" });
    assert.equal(
      (await request({ action: "advisor", request: draft() })).status,
      401,
    );
    assert.equal(
      (await request({ action: "status" }, b)).body.principal,
      other.body.principal,
    );
    const priorService=process.env.K_SERVICE;
    process.env.K_SERVICE='sparrow-cloud-run-test';
    try{
      const hosted=await request({action:'status'},b,{origin:'https://newsparrow.vercel.app'});
      assert.equal(hosted.status,200);
      assert.ok(hosted.cookie.includes('; Secure'));
      assert.equal((await request({action:'status'},b)).status,403);
    }finally{if(priorService===undefined)delete process.env.K_SERVICE;else process.env.K_SERVICE=priorService;}
  } finally {
    delete process.env.PUBLIK_API_KEY;
    await new Promise((r) => server.close(r));
    await provider.close();
  }
});
