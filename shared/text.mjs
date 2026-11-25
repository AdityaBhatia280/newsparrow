// Text helpers shared by the browser and the server. Pure functions only.

// "Dr" is left out on purpose: "Research with Dr. Lee" is an activity, not an address.
const STREET = "(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy|Highway|Hwy|Trail|Trl)";

/** Removes contact details before text is shown to AI: emails, phone numbers, links, street addresses and ZIP codes. */
export function redactContact(input) {
  return String(input ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/\b(?:linkedin|github|instagram|tiktok|twitter|x|facebook)\.com\/\S*/gi, "[link removed]")
    .replace(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone removed]")
    // A street address at the start of a line or after a separator (|, •, ·, ;), through the end of that segment.
    .replace(new RegExp(`(^|[|•·;]\\s*)\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,4}${STREET}\\.?(?=[\\s,]|$)[^\\n|•·;]*`, "gim"), "$1[address removed]")
    .replace(/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g, "[address removed]");
}

/** Lowercase words only, for checking that an AI-quoted excerpt really appears in a source text. */
export function normalizeForMatch(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when `excerpt` (at least a few words) occurs in `source`, ignoring case, spacing and punctuation.
 *  It must start on a word boundary; it may end mid-word (a quote cut short is still a quote). */
export function excerptIn(source, excerpt) {
  const e = normalizeForMatch(excerpt);
  if (e.length < 8 || !e.includes(" ")) return false;
  return (" " + normalizeForMatch(source)).includes(" " + e);
}

const HEADINGS = [
  [/^(activities|extracurricular activities|extracurriculars|leadership|experience|work experience|employment|volunteer(?:ing)?(?: experience)?|community service|clubs|athletics|sports|projects|research)\b/i, "activity"],
  [/^(awards|honors|honours|awards (?:and|&) honors|honors (?:and|&) awards|achievements|recognition)\b/i, "honor"],
  [/^(skills|technical skills|languages|interests)\b/i, "skills"],
  [/^(education|coursework|objective|summary|profile|references|contact)\b/i, null],
];

/** A no-AI fallback: turns common resume sections into editable suggestions. The student reviews everything. */
export function heuristicResume(text, max = 15) {
  const items = [];
  const skills = new Set();
  let section = null, current = null;
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const bare = line.replace(/[:\-–—|]+$/, "").trim();
    const heading = bare.length <= 40 ? HEADINGS.find(([re]) => re.test(bare)) : null;
    if (heading) {
      section = heading[1];
      current = null;
      continue;
    }
    if (!section) continue;
    if (section === "skills") {
      for (const s of line.replace(/^[-•*·▪●]\s*/, "").split(/[,;•·|]/)) {
        const v = s.trim();
        if (v && v.length <= 40 && !/removed\]/.test(v)) skills.add(v);
      }
      continue;
    }
    const bullet = /^[-•*·▪●◦]\s*/.test(line);
    const clean = line.replace(/^[-•*·▪●◦]\s*/, "");
    if (bullet && current) {
      current.description = (current.description ? current.description + " " : "") + clean;
      continue;
    }
    if (items.length >= max) break;
    const parts = clean.split(/\s+[–—-]\s+|\s*\|\s*|,\s+(?=[A-Z])/);
    current = {
      kind: section === "honor" ? "honor" : "activity",
      title: parts[0].slice(0, 100),
      role: section === "activity" && parts.length > 1 ? parts[1].slice(0, 50) : null,
      organization: null,
      description: null,
      grades: [],
    };
    items.push(current);
  }
  for (const item of items) if (item.description) item.description = item.description.slice(0, 150);
  return { activities: items, skills: [...skills].slice(0, 20) };
}

/** The link as the student gave it, minus the fragment and tracking parameters. */
export function cleanUrl(raw) {
  const u = new URL(raw);
  u.hash = "";
  for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
  return u.href;
}

/** Normalizes a public URL for duplicate checks: lowercase host, no hash, no trailing slash, no tracking parameters. */
export function normalizeUrl(raw) {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
  let out = u.protocol + "//" + u.hostname + u.pathname.replace(/\/+$/, "") + (u.search || "");
  return out;
}
