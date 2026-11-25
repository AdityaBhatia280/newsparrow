import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { checkUrl, createSafeFetch, guardedLookup, htmlToText, isPublicAddress } from "../../server/safe-fetch.mjs";
import { buildCalendar } from "../../server/ics.mjs";
import { matchProfile, scoreCollege, scoreOpportunity } from "../../server/match.mjs";
import { SECURITY_HEADERS } from "../../server/headers.mjs";
import { splitStatements } from "../../server/db/index.mjs";
import { cleanUrl, excerptIn, heuristicResume, normalizeUrl, redactContact } from "../../shared/text.mjs";

test("SSRF guard: only public addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1",
    "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2001:db8::1", "ff02::1", "not-an-ip",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
});

test("SSRF guard: URL rules", () => {
  assert.equal(checkUrl("https://www.example.org/a#frag").ok, true);
  for (const bad of ["http://example.org", "https://user:pw@example.org", "https://example.org:8443/", "https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://printer.local/", "https://intranet/", "ftp://example.org", "javascript:alert(1)"])
    assert.equal(checkUrl(bad).ok, false, bad);
});

test("SSRF guard: DNS answers are checked at connect time", async () => {
  const lookup = guardedLookup((host, opts, cb) => cb(null, host === "rebind.example.org" ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.215.14", family: 4 }]));
  await new Promise((done) =>
    lookup("rebind.example.org", {}, (err) => {
      assert.equal(err.code, "EBLOCKED");
      done();
    }),
  );
  await new Promise((done) =>
    lookup("www.example.org", { all: true }, (err, list) => {
      assert.equal(err, null);
      assert.equal(list[0].address, "93.184.215.14");
      done();
    }),
  );
});

test("SSRF guard: redirects are re-validated, and pages are read as text", async () => {
  const hops = { "https://a.example.org/": { status: 302, location: "https://127.0.0.1/admin" } };
  const fetchPage = createSafeFetch({ get: async (url) => hops[url.href] ?? { status: 200, type: "text/html", body: Buffer.from("<p>ok</p>") } });
  const blocked = await fetchPage("https://a.example.org/");
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /redirected/);
  const html = `<html><head><title>Program &amp; More</title><script>steal()</script><style>.x{}</style></head><body><nav>Menu</nav><h1>Young Makers</h1><p>Open to grades 9&ndash;12 &#x2014; apply soon.</p></body></html>`;
  const page = htmlToText(html);
  assert.equal(page.title, "Program & More");
  assert.ok(!page.text.includes("steal") && !page.text.includes(".x{}"));
  assert.match(page.text, /Open to grades 9–12 — apply soon\./);
  const ok = await createSafeFetch({ get: async () => ({ status: 200, type: "text/html; charset=utf-8", body: Buffer.from("<p>" + "Real readable text for students. ".repeat(5) + "</p>") }) })("https://ok.example.org/");
  assert.equal(ok.ok, true);
});

test("redaction removes contact details but keeps activities", () => {
  const out = redactContact(
    "Jordan Lee\njordan@example.com | +1 (512) 555-0134 | 123 Oak Street, Austin, TX 78701\nwww.jordan.dev · github.com/jordan\nResearch with Dr. Lee on 3 projects\n2021-2023 Robotics Club",
  );
  for (const gone of ["jordan@example.com", "555-0134", "Oak Street", "78701", "jordan.dev", "github.com/jordan"]) assert.ok(!out.includes(gone), gone);
  assert.match(out, /Research with Dr\. Lee on 3 projects/);
  assert.match(out, /2021-2023 Robotics Club/);
});

test("excerpt matching ignores case and punctuation but needs real words in order", () => {
  const src = "The Young Makers Fellowship supports high school students—who build hardware.";
  assert.equal(excerptIn(src, "young makers fellowship supports HIGH school"), true);
  assert.equal(excerptIn(src, "students who build hard"), true, "a quote cut short at the end still counts");
  assert.equal(excerptIn(src, "oung makers"), false, "must start on a word");
  assert.equal(excerptIn(src, "fellowship pays students"), false);
  assert.equal(excerptIn(src, "the"), false);
});

test("heuristic resume parser finds sections without AI", () => {
  const parsed = heuristicResume("Jordan\nACTIVITIES\nRobotics Club – Captain\n• Led build season\nDebate Team\nAWARDS\nState science fair finalist\nSKILLS\nPython, CAD, Spanish");
  assert.deepEqual(parsed.activities.map((a) => [a.kind, a.title]), [["activity", "Robotics Club"], ["activity", "Debate Team"], ["honor", "State science fair finalist"]]);
  assert.equal(parsed.activities[0].role, "Captain");
  assert.equal(parsed.activities[0].description, "Led build season");
  assert.deepEqual(parsed.skills, ["Python", "CAD", "Spanish"]);
});

test("URL normalization for duplicates", () => {
  assert.equal(normalizeUrl("https://WWW.Example.org/path/?utm_source=x#top"), "https://example.org/path");
  assert.equal(cleanUrl("https://www.example.org/a?utm_medium=b&id=3#x"), "https://www.example.org/a?id=3");
});

test("matching explains fit and respects eligibility", () => {
  const p = matchProfile({ grade: 11, interests: ["computing"], goals: ["competitions"], format: "virtual", budget: "free", region: "TX", study_location: "home_state" });
  const good = scoreOpportunity({ interests: ["computing"], grades: [9, 10, 11, 12], type: "competition", format: "virtual", cost: "free" }, p);
  assert.equal(good.label, "Great match");
  assert.ok(good.reasons.length > 0 && good.reasons.length <= 3);
  const wrongGrade = scoreOpportunity({ interests: ["computing"], grades: [12], type: "competition", format: "virtual", cost: "free" }, p);
  assert.equal(wrongGrade.eligible, false);
  assert.equal(wrongGrade.label, "Check eligibility");
  const home = scoreCollege({ state: "TX", program_shares: { computer: 0.2 }, net_price: 12000 }, p);
  const away = scoreCollege({ state: "CA", program_shares: { computer: 0.2 }, net_price: 12000 }, p);
  assert.ok(home.score > away.score);
  assert.ok(home.reasons.some((r) => /computer science/.test(r)));
});

test("iCalendar output escapes text and folds long lines", () => {
  const ics = buildCalendar([{ uid: "t1", date: "2027-01-05", title: "Essay, draft; final\nreview " + "x".repeat(90) }], new Date("2026-11-24T00:00:00Z"));
  assert.match(ics, /SUMMARY:Essay\\, draft\\; final\\nreview/);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
  assert.match(ics, /DTEND;VALUE=DATE:20270106/);
});

test("vercel.json security headers match the local server", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  const all = Object.fromEntries(config.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value]));
  assert.deepEqual(all, SECURITY_HEADERS);
  assert.ok(config.rewrites.some((r) => r.source === "/api/:path*"));
});

test("migration splitter keeps dollar-quoted blocks together", () => {
  const parts = splitStatements("create table a (x int);\n-- comment\ndo $$\nbegin\n  perform 1;\nend\n$$;\nselect 1;");
  assert.equal(parts.length, 3);
  assert.match(parts[1], /^do \$\$[\s\S]*perform 1;[\s\S]*\$\$$/);
});
