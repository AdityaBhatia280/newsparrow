// Deterministic, free matching between a student's profile and catalog records. No AI, no billing.
import { BY_ID, PROGRAM_LABELS, regionOf, stateName } from "../shared/taxonomy.mjs";

const gradesText = (grades) => {
  const g = [...grades].sort((a, b) => a - b);
  return g.length > 1 && g[g.length - 1] - g[0] === g.length - 1 ? `${g[0]}–${g[g.length - 1]}` : g.join(", ");
};

/** Turns a profile row into the shape the scorers use. */
export function matchProfile(p = {}) {
  return {
    grade: p.grade ?? null,
    interests: p.interests || [],
    goals: p.goals || [],
    format: p.format || null,
    budget: p.budget || null,
    region: p.region || null,
    studyLocation: p.study_location || p.studyLocation || null,
  };
}

export function scoreOpportunity(o, p, now = Date.now()) {
  let score = 0;
  let eligible = true;
  const reasons = [];
  const interests = new Set(p.interests);
  const overlap = (o.interests || []).filter((i) => interests.has(i));
  if (overlap.length) {
    score += 35 + 8 * Math.min(overlap.length - 1, 2);
    reasons.push(`Fits your interest in ${BY_ID.interest[overlap[0]]?.label.toLowerCase() ?? overlap[0]}`);
  } else if (!(o.interests || []).length) {
    score += 14;
    reasons.push("Open to students with any interest");
  } else if (!interests.size || interests.has("exploring")) score += 10;

  if (p.grade) {
    if (!o.grades?.length || o.grades.includes(p.grade)) {
      score += 15;
      if (o.grades?.length && o.grades.length < 4) reasons.push(`For ${o.grades.length === 1 ? "grade" : "grades"} ${gradesText(o.grades)}`);
    } else {
      eligible = false;
      score -= 45;
    }
  }

  const goal = (p.goals || []).find((g) => BY_ID.goal[g]?.types.includes(o.type));
  if (goal) {
    score += 15;
    reasons.push(`Matches your goal: ${BY_ID.goal[goal].label.toLowerCase()}`);
  }

  if (p.format === "virtual" || p.format === "in_person") {
    if (o.format === p.format) {
      score += 10;
      reasons.push(o.format === "virtual" ? "Online, so you can join from anywhere" : "In person, like you prefer");
    } else if (o.format === "virtual" || o.format === "in_person") score -= 10;
  }
  if (o.format === "in_person" && p.region && o.location && stateName(p.region) && o.location.includes(stateName(p.region))) {
    score += 8;
    reasons.push(`In ${stateName(p.region)}`);
  }

  if (p.budget === "free") {
    if (o.cost === "free") {
      score += 10;
      reasons.push("No cost to take part");
    } else if (o.cost === "paid") score -= 15;
  } else if (o.cost === "free") score += 4;

  if (o.deadline) {
    const days = (Date.parse(o.deadline) - now) / 86_400_000;
    if (days < 0) score -= 20;
    else if (days <= 45) {
      score += 5;
      reasons.push("Deadline coming up");
    }
  }
  const label = !eligible ? "Check eligibility" : score >= 60 ? "Great match" : score >= 38 ? "Good match" : "Worth a look";
  return { score, label, reasons: reasons.slice(0, 3), eligible };
}

const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

export function scoreCollege(c, p) {
  let score = 0;
  const reasons = [];
  const fields = [...new Set(p.interests.flatMap((i) => BY_ID.interest[i]?.programs || []))];
  const shares = c.program_shares || {};
  let best = null;
  for (const f of fields) {
    const v = Number(shares[f]) || 0;
    if (!best || v > best.v) best = { f, v };
  }
  if (best && best.v > 0) {
    score += Math.min(40, best.v * 220);
    if (best.v >= 0.04) reasons.push(`${Math.round(best.v * 100)}% of degrees are in ${PROGRAM_LABELS[best.f]?.toLowerCase() ?? best.f}`);
  }
  const where = p.studyLocation;
  if (p.region && stateName(p.region)) {
    if (c.state === p.region) {
      score += where === "home_state" ? 35 : where === "region" ? 20 : 8;
      if (where !== "anywhere") reasons.push(`In ${stateName(p.region)}`);
    } else if (regionOf(c.state) && regionOf(c.state) === regionOf(p.region)) {
      score += where === "region" ? 22 : where === "home_state" ? 2 : 3;
      if (where === "region") reasons.push(`In the ${regionOf(c.state)}`);
    } else if (where === "home_state" || where === "region") score -= 25;
  }
  if (Number.isFinite(c.net_price)) {
    if (c.net_price <= 15_000) {
      score += 10;
      reasons.push(`Average net price ${money(c.net_price)} a year`);
    } else if (c.net_price <= 25_000) score += 5;
  }
  if (Number.isFinite(c.completion_rate) && c.completion_rate >= 0.7) {
    score += 6;
    if (reasons.length < 3) reasons.push(`${Math.round(c.completion_rate * 100)}% of students finish within six years`);
  }
  return { score, reasons: reasons.slice(0, 3) };
}

/** Picks a varied top list: best scores first, alternating public and private where possible. */
export function variedTop(items, count, key = (x) => x.ownership) {
  const pool = [...items];
  const out = [];
  let last = null;
  while (out.length < count && pool.length) {
    const i = pool.findIndex((x) => key(x) !== last);
    const next = pool.splice(i >= 0 && i < 4 ? i : 0, 1)[0];
    out.push(next);
    last = key(next);
  }
  return out;
}
