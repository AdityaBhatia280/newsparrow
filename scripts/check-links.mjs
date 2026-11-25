// Checks every official link in db/seed/opportunities.json.
//   node scripts/check-links.mjs            report only
//   node scripts/check-links.mjs --write    also stamp linkCheckedAt on working links and drop dead ones
// "blocked" means the site refused an automated request (bot protection); the link itself may be fine.
import fs from "node:fs";

const FILE = new URL("../db/seed/opportunities.json", import.meta.url);
const seed = JSON.parse(fs.readFileSync(FILE, "utf8"));
const write = process.argv.includes("--write");
const today = new Date().toISOString();

async function check(item) {
  try {
    const res = await fetch(item.officialUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; SparrowLinkCheck/1.0; +https://newsparrow.vercel.app/support)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      },
    });
    const html = res.ok ? (await res.text()).slice(0, 200_000) : "";
    res.body?.cancel?.().catch?.(() => {});
    const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 90);
    const state = res.ok ? "ok" : ([401, 403, 405, 429, 503].includes(res.status) || (res.status >= 520 && res.status <= 530)) ? "blocked" : "dead";
    return { state, status: res.status, finalUrl: res.url, title };
  } catch (error) {
    // Cookie-based redirect loops work in browsers but not for automated requests.
    const blocked = /redirect count exceeded/i.test(String(error.cause?.message || ""));
    return { state: blocked ? "blocked" : "dead", status: 0, finalUrl: "", title: "", error: blocked ? "redirect loop" : error.cause?.code || error.name };
  }
}

const results = [];
const queue = [...seed.items];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) results.push({ item, ...(await check(item)) });
  }),
);
results.sort((a, b) => a.item.title.localeCompare(b.item.title));
console.log("| Opportunity | Organization | Link | Result |\n|---|---|---|---|");
for (const r of results)
  console.log(`| ${r.item.title} | ${r.item.provider} | ${r.item.officialUrl} | ${r.state} ${r.status || r.error || ""}${r.state === "ok" && r.title ? ` · "${r.title}"` : ""} |`);
const counts = results.reduce((m, r) => ((m[r.state] = (m[r.state] || 0) + 1), m), {});
console.log(`\n${results.length} links: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);

if (write) {
  const byUrl = new Map(results.map((r) => [r.item.slug, r]));
  seed.items = seed.items
    .filter((i) => byUrl.get(i.slug).state !== "dead")
    .map((i) => (byUrl.get(i.slug).state === "ok" ? { ...i, linkCheckedAt: today } : i));
  fs.writeFileSync(FILE, JSON.stringify(seed, null, 2) + "\n");
  console.log(`wrote ${seed.items.length} items (dead links removed)`);
}
