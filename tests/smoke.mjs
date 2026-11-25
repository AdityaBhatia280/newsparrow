// Browser smoke test: drives headless Chrome/Edge through Sparrow against in-process PGlite, fake sign-in and fake publik.
// No external services and no billable calls. Set SPARROW_SHOTS=<dir> to save screenshots for visual review.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startHarness } from "./support/harness.mjs";
import { RESUME_LINES, makePdf } from "./support/fixtures.mjs";

const browser = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((x) => x && fs.existsSync(x));
if (!browser) throw new Error("Chrome/Edge unavailable; set CHROME_PATH.");
if (!fs.existsSync(new URL("../sparrow/dist/app.js", import.meta.url))) throw new Error("Run npm run build first.");

const h = await startHarness({ seedColleges: 120 });
h.pages.set("https://www.example.org/young-makers", {
  ok: true,
  url: "https://www.example.org/young-makers",
  title: "Young Makers Fellowship",
  description: "",
  text: "The Young Makers Fellowship supports high school students who build hardware projects in their communities.",
});
const url = h.origin;
const shots = process.env.SPARROW_SHOTS ? path.resolve(process.env.SPARROW_SHOTS) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sparrow-smoke-"));
const resumePath = path.join(tmp, "resume.pdf");
fs.writeFileSync(resumePath, makePdf(RESUME_LINES));

const child = spawn(
  browser,
  ["--headless=new", `--user-data-dir=${path.join(tmp, "profile")}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--enable-unsafe-swiftshader", "about:blank"],
  { stdio: "ignore", windowsHide: true },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const passed = [];
const guard = setTimeout(() => {
  console.error("Smoke test timed out");
  child.kill();
  process.exit(1);
}, 240_000);
let ws;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = parseInt(fs.readFileSync(path.join(tmp, "profile", "DevToolsActivePort"), "utf8"));
    } catch {}
  }
  assert.ok(port, "browser started");
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  let seq = 0;
  const pending = new Map(), errors = [], consoleErrors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (m) => (m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result)));
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const ev = async (expression) => {
    const r = await S("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  await S("Page.enable");
  await S("Runtime.enable");
  await S("DOM.enable");
  const viewport = async (width, height = width < 600 ? 844 : 900) =>
    S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await viewport(1440);
  const wait = async (expr, label = expr, tries = 120) => {
    for (let i = 0; i < tries; i++) {
      if (await ev(expr).catch(() => false)) return;
      await sleep(100);
    }
    const page = await ev(`location.pathname + location.search + "\\n" + document.body.innerText.slice(0, 700)`).catch(() => "?");
    throw new Error(`Timed out waiting for: ${label}\n--- page ---\n${page}\n--- errors ---\n${[...errors, ...consoleErrors].join("\n")}`);
  };
  const shot = async (name) => {
    if (!shots) return;
    await sleep(350);
    const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(shots, name + ".png"), Buffer.from(data, "base64"));
  };
  const q = JSON.stringify;
  const click = async (sel) => {
    await wait(`!!document.querySelector(${q(sel)})`, sel);
    await ev(`document.querySelector(${q(sel)}).click()`);
    await sleep(120);
  };
  const clickText = async (sel, text) => {
    const expr = `[...document.querySelectorAll(${q(sel)})].find((e) => e.textContent.trim().includes(${q(text)}) && !e.disabled)`;
    await wait(`!!(${expr})`, `${sel} "${text}"`);
    await ev(`(${expr}).click()`);
    await sleep(150);
  };
  const type = async (sel, value) => {
    await wait(`!!document.querySelector(${q(sel)})`, sel);
    await ev(`(() => { const e = document.querySelector(${q(sel)}); e.focus(); const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(e, ${q(value)}); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await sleep(80);
  };
  const go = async (p) => {
    await ev(`history.pushState(null, "", ${q(p)}); dispatchEvent(new PopStateEvent("popstate"))`);
    await sleep(250);
  };
  const text = () => ev("document.body.innerText");

  // ---------- landing ----------
  await S("Page.navigate", { url });
  await wait(`document.querySelector("#hero-title")?.textContent.includes("step")`, "landing hero");
  await wait(`document.fonts.status === "loaded"`);
  await sleep(1400);
  await shot("01-landing");
  await viewport(390);
  await shot("01-landing-phone");
  await viewport(1440);
  await ev(`document.querySelector("#features").scrollIntoView()`);
  await sleep(900);
  await shot("02-landing-features");
  assert.equal(await ev(`document.documentElement.scrollWidth > innerWidth`), false, "landing has no horizontal overflow");
  for (const p of ["/privacy", "/terms", "/support"]) {
    const res = await fetch(url + p);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /contact address shown here once/, p + " shows the missing-contact notice");
  }
  passed.push("Landing, hero, features and legal pages render");

  // ---------- sign-in ----------
  await S("Page.navigate", { url: url + "/app" });
  await wait(`document.body.innerText.includes("Continue with Google")`, "sign-in screen");
  await shot("03-sign-in");
  assert.equal(await ev(`!!document.querySelector("input[type=email]")`), false, "there is no email sign-in");
  await clickText("button", "Continue with Google");
  await wait(`document.querySelector("[role=alert]")?.textContent.includes("13 or older")`, "consent required");
  await click(".check input");
  await clickText("button", "Continue with Google");
  await wait(`document.querySelector("h1")?.textContent.includes("Sign in with publik")`, "publik gate");
  await shot("04-publik-gate");
  assert.equal(h.provider.installs.size, 1, "an install was minted for this person");
  passed.push("Google sign-in requires consent; the first page after sign-in is Sign in with publik");

  // ---------- publik gate ----------
  await wait(`!!document.querySelector('a[href*="fixture-claim"]')`, "claim link");
  assert.match(await ev(`document.querySelector('a[href*="fixture-claim"]').href`), /return_to=/);
  await ev(`(() => { const a = document.querySelector('a[href*="fixture-claim"]'); a.addEventListener("click", (e) => e.preventDefault()); a.click(); })()`);
  h.provider.claimAll();
  await wait(`!!document.querySelector(".wizard")`, "onboarding after claim", 120);
  passed.push("Gate polls publik and continues once signed in");

  // ---------- onboarding ----------
  await shot("05-onboarding-basics");
  await clickText("button", "Continue");
  await wait(`document.querySelector("[role=alert]")?.textContent.includes("name")`, "basics validation");
  await type("input[autocomplete=given-name]", "Maya");
  await clickText(".chip", "Grade 11");
  await type("select.select", "TX");
  await clickText("button", "Continue");
  await wait(`!!document.querySelector(".persona")`, "persona step");
  await clickText(".persona", "Building");
  await shot("06-onboarding-persona");
  await clickText("button", "Continue");
  await wait(`document.body.innerText.includes("Computer science")`, "interests");
  await clickText(".chip", "Computer science");
  await clickText(".chip", "Engineering & robotics");
  await shot("07-onboarding-interests");
  await clickText("button", "Continue");
  await clickText(".chip", "Competitions & awards");
  await clickText(".chip", "Research experience");
  await clickText("button", "Continue");
  await clickText(".chip", "In my state");
  await clickText(".chip", "Free only");
  await shot("08-onboarding-time");
  await clickText("button", "Continue");
  await wait(`!!document.querySelector(".dropzone input[type=file]")`, "resume step");
  const { result } = await S("Runtime.evaluate", { expression: `document.querySelector(".dropzone input[type=file]")` });
  await S("DOM.setFileInputFiles", { files: [resumePath], objectId: result.objectId });
  await wait(`!!document.querySelector("#resume-text")`, "resume text review", 200);
  const reviewed = await ev(`document.querySelector("#resume-text").value`);
  assert.match(reviewed, /Robotics Club/);
  for (const secret of ["jordan.lee@example.com", "555-0134", "Oak Street"]) assert.ok(!reviewed.includes(secret), secret + " shown");
  await shot("09-resume-review");
  await click(".consent input");
  await clickText("button", "Analyze with AI");
  await wait(`!!document.querySelector(".import-item")`, "resume results", 150);
  await shot("10-resume-results");
  await clickText("button", "Save 1 item");
  await wait(`document.body.innerText.includes("Make it personal with AI")`, "build step", 150);
  await click(".consent input");
  await clickText("button", "Build my plan with AI");
  await wait(`!!document.querySelector(".runthrough")`, "run-through", 200);
  await shot("11-runthrough-you");
  assert.ok((await text()).includes("Fixture summary"), "AI summary shown");
  passed.push("Survey, in-browser PDF resume reading with redaction, AI analysis and AI plan build");

  for (let i = 0; i < 4; i++) {
    await clickText(".runthrough__foot button", "Next");
    if (i === 0) {
      await wait(`document.querySelectorAll(".opp-card").length >= 3`, "opportunity picks");
      await shot("12-runthrough-opportunities");
      await clickText("button", "Save all");
    }
    if (i === 1) await shot("13-runthrough-colleges");
  }
  await shot("14-runthrough-dock");
  await clickText(".runthrough__foot button", "Let's go");
  await wait(`!!document.querySelector(".tour__card")`, "dock tour");
  await shot("15-tour");
  for (let i = 0; i < 4; i++) await click(".tour__card .btn--primary");
  await wait(`!document.querySelector(".tour") && !!document.querySelector("#dock")`, "tour done");
  passed.push("Run-through saves picks and leads into the dock tour");

  // ---------- home ----------
  await wait(`!!document.querySelector(".stat-row")`, "home");
  await shot("16-home");
  assert.ok(await ev(`[...document.querySelectorAll(".stat strong")].some((s) => Number(s.textContent) >= 1)`), "saved count on home");
  passed.push("Home shows counts, tasks and matches");

  // ---------- explore & detail ----------
  await click('#dock a[data-dock="explore"]');
  await wait(`document.querySelectorAll(".opp-card").length > 5`, "explore results");
  await shot("17-explore");
  await type("#explore-search", "USA Computing");
  await wait(`document.querySelector(".opp-card h3")?.textContent.includes("USA Computing")`, "search result");
  await click(".opp-card .stretched");
  await wait(`document.querySelector(".detail__title")?.textContent.includes("USA Computing")`, "detail");
  await shot("18-opportunity");
  if (await ev(`[...document.querySelectorAll(".detail__side button")].some((b) => b.textContent.includes("Save to my plan"))`)) await clickText(".detail__side button", "Save to my plan");
  await wait(`!!document.querySelector(".detail__side select")`, "saved controls");
  await type("#quick-task", "Practice a Bronze problem");
  await ev(`document.querySelector("#quick-task").closest("form").requestSubmit()`);
  await sleep(300);
  passed.push("Explore search, detail page, save and quick task");

  // ---------- plan ----------
  await click('#dock a[data-dock="plan"]');
  await wait(`document.querySelectorAll(".board__card").length >= 2`, "board");
  await shot("19-plan-board");
  await type(".board__card select", "preparing");
  await wait(`[...document.querySelectorAll('.board__col[data-status="preparing"] .board__card')].length >= 1`, "moved card");
  await clickText(".segmented button", "Tasks");
  await wait(`document.body.innerText.includes("Practice a Bronze problem")`, "tasks view");
  await type("#new-task", "Email my counselor");
  await ev(`document.querySelector("#new-task").closest("form").requestSubmit()`);
  await wait(`document.body.innerText.includes("Email my counselor")`, "task added");
  await shot("20-plan-tasks");
  await clickText(".segmented button", "Calendar");
  await wait(`!!document.querySelector(".calendar__grid")`, "calendar");
  await shot("21-plan-calendar");
  const ics = await ev(`fetch("/api/calendar.ics").then((r) => r.text())`);
  assert.match(ics, /BEGIN:VCALENDAR/);
  await clickText(".segmented button", "Roadmap");
  await wait(`!!document.querySelector(".roadmap__item")`, "roadmap");
  await shot("22-plan-roadmap");
  passed.push("Plan board move, tasks, calendar export and roadmap");

  // ---------- colleges ----------
  await click('#dock a[data-dock="colleges"]');
  await wait(`document.querySelectorAll(".college-card").length > 3`, "colleges");
  await shot("23-colleges");
  await ev(`document.querySelectorAll(".compare-toggle input")[0].click(); document.querySelectorAll(".compare-toggle input")[1].click();`);
  await wait(`!!document.querySelector(".compare-tray")`, "compare tray");
  await clickText(".compare-tray button", "Compare");
  await wait(`!!document.querySelector(".compare__table")`, "compare table");
  await shot("24-compare");
  await click(".compare__table thead a");
  await wait(`!!document.querySelector(".stat-grid")`, "college detail");
  await shot("25-college");
  passed.push("College search, compare and detail");

  // ---------- advisor ----------
  await click('#dock a[data-dock="advisor"]');
  await wait(`!!document.querySelector("#advisor-input")`, "advisor");
  await shot("26-advisor");
  await type("#advisor-input", "Help me plan this month around robotics.");
  await click(".composer .consent input");
  await clickText(".composer button", "Send");
  await wait(`!!document.querySelector(".answer .rec")`, "advisor answer", 150);
  await shot("27-advisor-answer");
  h.provider.state.chatMode = "402";
  await type("#advisor-input", "And next month?");
  await clickText(".composer button", "Send");
  await wait(`document.querySelector(".composer .notice")?.textContent.includes("Fixture allowance used up")`, "402 notice");
  assert.equal(await ev(`document.querySelectorAll(".composer .notice a").length`), 1, "402 shows exactly one link");
  assert.equal(await ev(`document.querySelector("#advisor-input").value`), "And next month?", "draft kept");
  h.provider.state.chatMode = "ok";
  passed.push("Advisor answer cards, 402 message with one link, draft kept");

  // ---------- profile, contribute, rewards, settings ----------
  await go("/app/profile");
  await wait(`!!document.querySelector(".activity")`, "activities");
  await shot("28-profile");
  await go("/app/contribute");
  await wait(`!!document.querySelector("input[type=url]")`, "contribute");
  await type("input[type=url]", "https://www.example.org/young-makers");
  await type("select.select", "program");
  await clickText("button", "Add suggestion");
  await wait(`document.body.innerText.includes("Fetch details with AI")`, "submission card");
  await click(".submission .consent input");
  await clickText(".submission button", "Fetch details with AI");
  await wait(`document.querySelector(".submission input.input")?.value.includes("Young Makers")`, "extracted fields", 150);
  await shot("29-contribute");
  await clickText(".submission button", "Send for review");
  await wait(`document.body.innerText.includes("Waiting for review")`, "pending");
  await go("/app/rewards");
  await wait(`!!document.querySelector(".points__value")`, "rewards");
  await shot("30-rewards");
  await go("/app/settings");
  await wait(`!!document.querySelector(".settings__grid")`, "settings");
  await shot("31-settings");
  await go("/app/admin");
  await wait(`document.body.innerText.includes("Reviewers only")`, "admin locked for students");
  passed.push("Profile, contribution with AI extraction, rewards, settings, reviewer lock");

  // ---------- every route at five widths ----------
  const routes = ["/app", "/app/explore", "/app/explore/usaco", "/app/colleges", "/app/plan", "/app/plan?view=tasks", "/app/plan?view=calendar", "/app/plan?view=roadmap", "/app/advisor", "/app/profile", "/app/contribute", "/app/rewards", "/app/settings", "/app/nope"];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await viewport(width);
    for (const r of routes) {
      await go(r);
      await wait(`!!document.querySelector("#main h1") && !document.querySelector(".skeleton")`, `${r} at ${width}`);
      assert.equal(await ev(`document.documentElement.scrollWidth > innerWidth + 1`), false, `${r} overflows at ${width}px`);
    }
    if (width === 390) {
      await go("/app");
      await wait(`!!document.querySelector(".stat-row")`);
      await shot("32-home-phone");
      await go("/app/plan");
      await wait(`!!document.querySelector(".board")`);
      await shot("33-plan-phone");
    }
  }
  await viewport(1440);
  passed.push("All routes at 1440, 1024, 768, 390 and 320 px without horizontal overflow");

  // ---------- reduced motion & effects ----------
  await S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await S("Page.reload");
  await wait(`!!document.querySelector("#dock")`, "reload with reduced motion");
  assert.equal(await ev(`document.documentElement.dataset.effects`), "reduced");
  assert.equal(await ev(`getComputedStyle(document.querySelector(".page-head, .home__hero, h1")).opacity`), "1");
  await S("Emulation.setEmulatedMedia", { features: [] });
  passed.push("Reduced motion turns effects down and content stays visible");

  // ---------- keyboard: skip link and dialogs ----------
  await go("/app/plan");
  await wait(`!!document.querySelector(".board__title")`);
  await click(".board__title");
  await wait(`!!document.querySelector("dialog[open]")`, "sheet open");
  await S("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await wait(`!document.querySelector("dialog[open]")`, "sheet closed with Escape");
  passed.push("Sheets open and close with Escape");

  // ---------- delete account ----------
  await go("/app/settings");
  await clickText("button", "Delete account");
  await wait(`!!document.querySelector("dialog[open] input")`, "confirm text");
  await type("dialog[open] input", "DELETE");
  await clickText("dialog[open] button", "Delete everything");
  await wait(`location.pathname === "/"`, "back to landing after delete", 120);
  const [{ n }] = await h.db.query("select count(*)::int as n from app_users where email = 'student@example.test'");
  assert.equal(n, 0, "account deleted");
  passed.push("Account deletion removes the account and returns to the landing page");

  assert.deepEqual(errors, [], "no uncaught exceptions");
  assert.deepEqual(consoleErrors.filter((e) => !/Failed to load resource/.test(e)), [], "no console errors");
  passed.push("No uncaught browser exceptions or console errors");
  console.log(passed.map((x) => "PASS " + x).join("\n"));
  console.log(`\n${passed.length} browser smoke checks passed.${shots ? ` Screenshots: ${shots}` : ""}`);
} finally {
  clearTimeout(guard);
  ws?.close();
  await h.close().catch(() => {});
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill();
  } catch {}
}
