// Fetches a public web page for opportunity extraction without letting a URL reach private networks.
// Every connection's resolved address is checked at connect time (DNS-rebinding safe), and every redirect is re-validated.
import dns from "node:dns";
import https from "node:https";
import net from "node:net";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
export const MAX_TEXT = 24_000;

const BLOCKED_SUFFIX = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa|localdomain)$/;

export function checkUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { ok: false, reason: "That isn't a valid web address." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Use an https:// link from the official website." };
  if (u.username || u.password) return { ok: false, reason: "Links with a username or password aren't allowed." };
  if (u.port && u.port !== "443") return { ok: false, reason: "Use a link on the standard https port." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || net.isIP(host.replace(/^\[|\]$/g, "")) || BLOCKED_SUFFIX.test(host))
    return { ok: false, reason: "Use a public website, not a private, local or IP address." };
  u.hostname = host;
  u.hash = "";
  return { ok: true, url: u };
}

function v4Parts(ip) {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

function publicV4([a, b, c]) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function v6Hextets(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4Parts(v4[1]);
    if (!p) return null;
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h) => (h ? h.split(":").map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN)) : []);
  const left = parse(halves[0]);
  if (halves.length === 1) return left.length === 8 && left.every(Number.isFinite) ? left : null;
  const right = parse(halves[1]);
  const fill = 8 - left.length - right.length;
  if (fill < 1) return null;
  const all = [...left, ...Array(fill).fill(0), ...right];
  return all.every(Number.isFinite) ? all : null;
}

export function isPublicAddress(address) {
  const kind = net.isIP(String(address));
  if (kind === 4) return publicV4(v4Parts(address));
  if (kind !== 6) return false;
  const h = v6Hextets(address);
  if (!h) return false;
  if (h.every((x) => x === 0)) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) // IPv4-mapped or -compatible
    return publicV4([h[6] >> 8, h[6] & 255, h[7] >> 8]);
  if (h[0] === 0x64 && h[1] === 0xff9b) return false; // NAT64
  if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local
  if ((h[0] & 0xffc0) === 0xfe80) return false; // link local
  if ((h[0] & 0xff00) === 0xff00) return false; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
  if (h[0] === 0x2001 && h[1] === 0) return false; // Teredo
  if (h[0] === 0x2002) return false; // 6to4
  if (h[0] === 0x100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return false; // discard
  return (h[0] & 0xe000) === 0x2000; // global unicast only
}

export function guardedLookup(resolve = dns.lookup) {
  return (hostname, options, callback) => {
    if (typeof options === "function") (callback = options), (options = {});
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: net.isIP(addresses) }];
      if (!list.length || list.some((a) => !isPublicAddress(a.address)))
        return callback(Object.assign(new Error("That address points to a private network."), { code: "EBLOCKED" }));
      if (options?.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

function httpsGet(url, { lookup }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        lookup,
        agent: false,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "SparrowBot/1.0 (opportunity review; +https://newsparrow.vercel.app/support)",
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "accept-language": "en-US,en;q=0.8",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location || null });
        }
        const type = String(res.headers["content-type"] || "");
        if (status !== 200 || !/^(text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(type)) {
          res.resume();
          return resolve({ status, type, body: null });
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(Object.assign(new Error("That page is too large to read."), { code: "ETOOBIG" }));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, type, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("The page took too long to answer."), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", copy: "©", reg: "®" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html) {
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "").replace(/\s+/g, " ").trim()).slice(0, 200);
  const description = decodeEntities(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] || "",
  ).slice(0, 400);
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe|canvas|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|header|footer|main|aside|nav|dd|dt|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT);
  return { title, description, text };
}

export function createSafeFetch({ resolve, get = httpsGet } = {}) {
  const lookup = guardedLookup(resolve);
  return async function fetchPage(raw) {
    let checked = checkUrl(raw);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let result;
      try {
        result = await get(checked.url, { lookup });
      } catch (error) {
        const reason =
          error?.code === "EBLOCKED" ? "That link points to a private network, so Sparrow won't open it."
          : error?.code === "ETOOBIG" ? error.message
          : error?.code === "ETIMEDOUT" ? error.message
          : "Sparrow couldn't reach that page. Check the link, or paste details into your notes.";
        return { ok: false, reason };
      }
      if (result.location !== undefined && result.status >= 300 && result.status < 400) {
        if (!result.location) return { ok: false, reason: "The page redirected without an address." };
        checked = checkUrl(new URL(result.location, checked.url).href);
        if (!checked.ok) return { ok: false, reason: "The page redirected to an address Sparrow won't open." };
        continue;
      }
      if (!result.body) return { ok: false, reason: `The page answered ${result.status || "without content"}, so there was nothing to read.` };
      const charset = /charset=([\w-]+)/i.exec(result.type || "")?.[1] || "utf-8";
      let html;
      try {
        html = new TextDecoder(charset).decode(result.body);
      } catch {
        html = new TextDecoder("utf-8").decode(result.body);
      }
      const page = /text\/plain/i.test(result.type) ? { title: "", description: "", text: html.slice(0, MAX_TEXT) } : htmlToText(html);
      if (page.text.length < 80) return { ok: false, reason: "That page didn't have enough readable text." };
      return { ok: true, url: checked.url.href, ...page };
    }
    return { ok: false, reason: "That page redirected too many times." };
  };
}

export const safeFetchPage = createSafeFetch();
