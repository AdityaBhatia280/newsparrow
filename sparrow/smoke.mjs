import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "./server.mjs";

const browser = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((x) => x && fs.existsSync(x));
if (!browser) throw new Error("Chrome/Edge unavailable; set CHROME_PATH.");
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sparrow-test-"));
const child = spawn(
  browser,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
const passed = [];
const guard = setTimeout(() => {
  console.error("Smoke test timed out");
  child.kill();
  process.exit(1);
}, 90000);
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = parseInt(
        fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8"),
      );
    } catch {}
  }
  assert.ok(port, "Browser started");
  const ver = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json();
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  let seq = 0;
  const pending = new Map(),
    errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text,
      );
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (m) =>
        m.error ? reject(new Error(m.error.message)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", {
      url: "about:blank",
    }),
    { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
  const S = (m, p) => send(m, p, sessionId);
  const ev = async (expression) => {
    const r = await S("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result?.value;
  };
  await S("Page.enable");
  await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await S("Page.navigate", { url });
  const wait = async (expr) => {
    for (let i = 0; i < 60; i++) {
      if (await ev(expr)) return;
      await sleep(50);
    }
    throw new Error(`Timed out: ${expr}`);
  };
  const go = async (r) => {
    await ev(`location.hash=${JSON.stringify(r)}`);
    await sleep(100);
  };
  const click = async (sel) => {
    await ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
    await sleep(60);
  };
  const fill = async (sel, value, event = "input") =>
    ev(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  const state = () =>
    ev(`JSON.parse(localStorage.getItem('sparrow.preview.v1'))`);
  const submit = async (sel) => {
    await ev(`document.querySelector(${JSON.stringify(sel)}).requestSubmit()`);
    await sleep(80);
  };
  await wait(`document.querySelector('.hero h1')`);
  assert.ok(
    (await ev("document.body.innerText")).includes("Illustrative preview"),
  );
  passed.push("Landing and explicit example labels");
  await click(".skip");
  assert.equal(await ev("document.activeElement.id"), "main");
  assert.equal(await ev("location.hash"), "");
  passed.push("Skip link focuses content without corrupting the route");
  await go("/start");
  await fill("[name=firstName]", "<img src=x onerror=alert(1)>");
  await fill("[name=grade]", "11", "change");
  await fill("[name=region]", "Texas");
  await submit("#onboarding-form");
  await click("[name=interests][value=Neuroscience]");
  await submit("#onboarding-form");
  await fill("[name=weeklyHours]", "4");
  await fill("[name=budget]", "Free opportunities", "change");
  await submit("#onboarding-form");
  await submit("#onboarding-form");
  await click('[name=goals][value="Explore colleges"]');
  await submit("#onboarding-form");
  assert.equal(
    await ev('!!document.querySelector(".review-list img")'),
    false,
    "Profile content is escaped",
  );
  await submit("#onboarding-form");
  await wait(`location.hash==='#/opportunities'`);
  assert.equal((await state()).onboarded, true);
  passed.push("Six-step onboarding, validation, persistence, escaped profile");
  await fill("[name=q]", "computing");
  assert.equal(
    await ev('document.querySelectorAll("#op-results .op-card").length'),
    1,
  );
  await click("[data-clear-filters]");
  await fill("[name=type]", "Competition", "change");
  assert.equal(
    await ev('document.querySelectorAll("#op-results .op-card").length'),
    1,
  );
  await click("[data-clear-filters]");
  passed.push("Search, type filter, reset");
  await click("[data-save=community-science]");
  await go("/opportunities/community-science");
  await click("[data-track=community-science]");
  await wait(`location.hash==='#/saved'`);
  await fill("[data-saved-field=note]", "Keep my notes");
  await fill("[data-saved-field=due]", "2027-01-15");
  await fill("[name=task]", "Read requirements");
  await submit("[data-task-form]");
  await click("[data-task]");
  await fill('[name="status-community-science"]', "Submitted", "change");
  let saved = (await state()).saved["community-science"];
  assert.equal(saved.note, "Keep my notes");
  assert.equal(saved.due, "2027-01-15");
  assert.equal(saved.tasks[0].done, true);
  assert.equal(saved.status, "Submitted");
  passed.push(
    "Save, track, note, personal date, task, independent status update",
  );
  await click("[data-save=community-science]");
  assert.equal(await ev('document.querySelector("dialog").open'), true);
  await click("dialog [value=cancel]");
  assert.ok((await state()).saved["community-science"]);
  await click("[data-save=community-science]");
  await click("dialog [value=remove]");
  assert.equal((await state()).saved["community-science"], undefined);
  passed.push("Destructive confirmation cancel and accept");
  await go("/colleges");
  await click("[data-college=rice]");
  await go("/colleges/rice");
  await fill("[data-college-note=rice]", "Ask about programs");
  assert.equal((await state()).colleges.rice.note, "Ask about programs");
  assert.equal(
    await ev('document.querySelector("a[target=_blank]").rel'),
    "noopener noreferrer",
  );
  passed.push("College shortlist, notes, safe official external link");
  await go("/contribute");
  await fill("[name=url]", "https://127.0.0.1/private");
  await fill("[name=type]", "Research", "change");
  await click("[name=confirm]");
  await submit("#contribute-form");
  assert.ok(
    (
      await ev('document.querySelector("#submission-error").innerText')
    ).includes("public HTTPS"),
  );
  await fill("[name=url]", "https://example.org/program");
  await fill("[name=title]", "<script>bad()</script>");
  await submit("#contribute-form");
  assert.equal((await state()).submissions.length, 1);
  assert.equal(
    await ev('!!document.querySelector(".submissions script")'),
    false,
  );
  await click("[data-edit-submission]");
  await fill("[name=title]", "Updated source");
  await submit("#contribute-form");
  assert.equal((await state()).submissions[0].title, "Updated source");
  passed.push("Submission URL validation, persistence, edit, escaping");
  await go("/advisor");
  await fill("[name=draft]", "Help me plan a community project.");
  await submit("#advisor-form");
  assert.equal(
    (await state()).advisor.draft,
    "Help me plan a community project.",
  );
  assert.ok(
    (await ev("document.body.innerText")).includes("AI connection not set up"),
  );
  passed.push("Advisor draft retention and disconnected service state");
  await click("[name=advisorCollege][value=rice]");
  await go("/advisor?opportunity=community-science");
  assert.equal(
    await ev('document.querySelector("[name=advisorContext]").checked'),
    true,
  );
  await click("[name=advisorContext]");
  await click('[data-advisor-task="Compare saved choices"]');
  assert.equal(
    await ev(
      'document.querySelector("[name=advisorContext]")?.checked || false',
    ),
    false,
  );
  assert.deepEqual((await state()).advisor.collegeIds, ["rice"]);
  passed.push("Advisor opportunity and college context selection persists");
  await S("Page.reload");
  await sleep(400);
  assert.equal((await state()).colleges.rice.note, "Ask about programs");
  passed.push("State survives reload");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await S("Emulation.setDeviceMetricsOverride", {
      width,
      height: width < 600 ? 844 : 900,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    for (const r of [
      "/",
      "/start",
      "/opportunities",
      "/opportunities/community-science",
      "/saved",
      "/colleges",
      "/colleges/rice",
      "/advisor",
      "/contribute",
      "/credits",
      "/settings",
      "/review",
      "/missing",
    ]) {
      await go(r);
      assert.equal(
        await ev("document.documentElement.scrollWidth>innerWidth"),
        false,
        `${r} overflow at ${width}`,
      );
      assert.ok(await ev('!!document.querySelector("h1")'), `${r} h1`);
    }
  }
  passed.push(
    "All routes at 1440, 1024, 768, 390, 320 pixels without horizontal overflow",
  );
  await go("/");
  await click(".menu-toggle");
  assert.equal(
    await ev(
      'document.querySelector(".menu-toggle").getAttribute("aria-expanded")',
    ),
    "true",
  );
  await S("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  assert.equal(
    await ev(
      'document.querySelector(".menu-toggle").getAttribute("aria-expanded")',
    ),
    "false",
  );
  passed.push("Mobile menu opens and closes with Escape");
  await S("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await S("Page.reload");
  await wait('document.querySelector(".hero h1")');
  assert.equal(
    await ev('getComputedStyle(document.querySelector("h1")).opacity'),
    "1",
  );
  assert.equal(
    await ev('getComputedStyle(document.querySelector(".btn")).animationName'),
    "none",
  );
  passed.push("Reduced-motion content remains visible");
  await go("/settings");
  await click("[data-clear-data]");
  await click("dialog [value=remove]");
  assert.equal(await ev("localStorage.getItem('sparrow.preview.v1')"), null);
  passed.push("Full local data deletion");
  assert.deepEqual(errors, []);
  passed.push("No uncaught browser exceptions");
  console.log(passed.map((x) => "PASS " + x).join("\n"));
  console.log(`\n${passed.length} browser smoke checks passed.`);
} finally {
  clearTimeout(guard);
  ws?.close();
  server.close();
  try {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else child.kill();
  } catch {}
  // The isolated temporary browser profile is retained for inspection; it contains only test inputs.
}
