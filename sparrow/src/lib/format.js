import { BY_ID, stateName } from "../../../shared/taxonomy.mjs";

export const label = (table, id, fallback = "") => (id ? BY_ID[table]?.[id]?.label ?? fallback : fallback);

export function gradesLabel(grades = []) {
  if (!grades.length) return "Any grade";
  const g = [...grades].sort((a, b) => a - b);
  if (g.length === 1) return `Grade ${g[0]}`;
  return g[g.length - 1] - g[0] === g.length - 1 ? `Grades ${g[0]}–${g[g.length - 1]}` : `Grades ${g.join(", ")}`;
}

export const money = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—");
export const percent = (v) => (Number.isFinite(v) ? Math.round(v * 100) + "%" : "—");
export const count = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");

const DAY = 86_400_000;
export function parseDay(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const today = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
export const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function dayLabel(iso, { year = false } = {}) {
  const d = parseDay(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year || d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

export function relativeDay(iso) {
  const d = parseDay(iso);
  if (!d) return null;
  const diff = Math.round((d - today()) / DAY);
  if (diff === 0) return { text: "Today", tone: "warn" };
  if (diff === 1) return { text: "Tomorrow", tone: "warn" };
  if (diff < 0) return { text: diff === -1 ? "Yesterday" : `${-diff} days ago`, tone: "bad" };
  if (diff <= 7) return { text: `In ${diff} days`, tone: "blue" };
  return { text: dayLabel(iso), tone: "" };
}

export function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const place = (city, state) => [city, state].filter(Boolean).join(", ");
export const regionLabel = (code) => (code === "INTL" ? "Outside the U.S." : stateName(code) || "");

export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function initials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "S").slice(0, 2)).toUpperCase();
}

export function collegeMonogram(name) {
  const words = String(name || "").replace(/\b(the|of|at|and|university|college|institute|-main campus)\b/gi, " ").trim().split(/[\s-]+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || "C")[0]).toUpperCase();
}

export const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
