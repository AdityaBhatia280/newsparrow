// Captures the landing hero as the 1200×630 social preview image (sparrow/public/images/og.png).
// Run after npm run build: node scripts/render-og.mjs
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../server/local.mjs";

const browser = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
].find((x) => x && fs.existsSync(x));
if (!browser) throw new Error("Chrome/Edge unavailable; set CHROME_PATH.");

const server = createServer({ db: null });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sparrow-og-"));
const child = spawn(browser, ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--hide-scrollbars", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = parseInt(fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8"));
    } catch {}
  }
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) pending.get(m.id)?.(m);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, (m) => resolve(m.result));
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S("Page.enable");
  await S("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await S("Page.navigate", { url: origin + "/?still" });
  await sleep(4000);
  const { data } = await S("Page.captureScreenshot", { format: "png" });
  const out = new URL("../sparrow/public/images/og.png", import.meta.url);
  fs.writeFileSync(out, Buffer.from(data, "base64"));
  console.log("wrote sparrow/public/images/og.png");
  ws.close();
} finally {
  server.close();
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill();
  } catch {}
}
