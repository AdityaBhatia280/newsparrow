// Shared planning helpers: grade roadmap tasks and college suggestions.
import { CENSUS_REGIONS, ROADMAP, regionOf } from "../shared/taxonomy.mjs";
import { pgArray } from "./db/index.mjs";
import { COLLEGE_FIELDS, collegeCard, taskJson } from "./models.mjs";
import { variedTop } from "./match.mjs";

/** The school term for a date: fall (Aug–Dec), spring (Jan–May) or summer (Jun–Jul). */
export function currentTerm(date = new Date()) {
  const m = date.getUTCMonth();
  return m >= 7 ? "fall" : m <= 4 ? "spring" : "summer";
}

export const roadmapKey = (grade, term, index) => `roadmap:${grade}:${term}:${index}`;

/** Adds this term's roadmap items for the student's grade as tasks. Safe to repeat. */
export async function addRoadmapTasks(db, userId, grade, term) {
  const items = ROADMAP[grade]?.terms[term] || [];
  const keys = [];
  for (let i = 0; i < items.length; i++) {
    const key = roadmapKey(grade, term, i);
    keys.push(key);
    await db.query(
      `insert into tasks (user_id, title, source, plan_key) values ($1, $2, 'plan', $3) on conflict (user_id, plan_key) do nothing`,
      [userId, items[i], key],
    );
  }
  if (!keys.length) return [];
  const rows = await db.query("select * from tasks where user_id = $1 and plan_key = any($2::text[]) order by plan_key", [userId, pgArray(keys)]);
  return rows.map(taskJson);
}

/** Up to `count` colleges that fit the profile, varied between public and private. */
export async function suggestColleges(db, userId, profile, count = 6) {
  let states = null;
  if (profile.region && profile.studyLocation === "home_state") states = [profile.region];
  else if (profile.region && profile.studyLocation === "region" && regionOf(profile.region)) states = CENSUS_REGIONS[regionOf(profile.region)];
  const rows = await db.query(
    `select ${COLLEGE_FIELDS}, s.tag, s.note from colleges c
       left join college_shortlist s on s.college_id = c.id and s.user_id = $1
      where ($2::text[] is null or c.state = any($2::text[])) and c.ownership in (1, 2)`,
    [userId, states ? pgArray(states) : null],
  );
  const scored = rows.map((r) => collegeCard(r, profile)).sort((a, b) => b.match.score - a.match.score);
  return variedTop(scored.slice(0, count * 3), count);
}
