// The student's profile and their Common App-style activities list.
import { z } from "zod";
import {
  ACTIVITY_CATEGORIES, BUDGETS, FORMAT_PREFS, GOALS, HONOR_LEVELS, INTERESTS, LIMITS, PERSONAS, STATES, STUDY_LOCATIONS, ids,
} from "../../shared/taxonomy.mjs";
import { callModel } from "../ai/client.mjs";
import { TIGHTEN } from "../ai/prompts.mjs";
import { tightenInput, tightenOutput } from "../ai/schemas.mjs";
import { pgArray } from "../db/index.mjs";
import { fail, parseWith } from "../http.mjs";
import { PROFILE_FIELDS, activityJson, loadProfile, profileJson } from "../models.mjs";

const STATE_CODES = STATES.map(([code]) => code);
const nullableText = (max) => z.string().trim().max(max).nullable().transform((v) => (v ? v : null));

const profilePatch = z
  .object({
    firstName: nullableText(50),
    grade: z.number().int().min(9).max(12).nullable(),
    region: z.string().refine((v) => STATE_CODES.includes(v) || v === "INTL", "Choose your state.").nullable(),
    persona: z.enum(ids(PERSONAS)).nullable(),
    interests: z.array(z.enum(ids(INTERESTS))).max(14),
    customInterest: nullableText(100),
    goals: z.array(z.enum(ids(GOALS))).max(GOALS.length),
    weeklyHours: z.number().int().min(0).max(40).nullable(),
    budget: z.enum(ids(BUDGETS)).nullable(),
    format: z.enum(ids(FORMAT_PREFS)).nullable(),
    studyLocation: z.enum(ids(STUDY_LOCATIONS)).nullable(),
    experience: nullableText(4000),
    skills: z.array(z.string().trim().min(1).max(60)).max(20),
    onboardingStep: z.number().int().min(0).max(12),
    tourDone: z.literal(true),
    settings: z.object({ effects: z.enum(["auto", "on", "off"]) }).partial(),
  })
  .partial()
  .strict();

const COLUMN = {
  firstName: ["first_name"], grade: ["grade"], region: ["region"], persona: ["persona"],
  interests: ["interests", "text[]"], customInterest: ["custom_interest"], goals: ["goals", "text[]"],
  weeklyHours: ["weekly_hours"], budget: ["budget"], format: ["format"], studyLocation: ["study_location"],
  experience: ["experience"], skills: ["skills", "text[]"], onboardingStep: ["onboarding_step"],
};

async function getProfile(ctx) {
  return profileJson(await loadProfile(ctx.db, ctx.user.id));
}

async function patchProfile(ctx) {
  const patch = parseWith(profilePatch, await ctx.body(8000));
  const sets = [], params = [ctx.user.id];
  for (const [key, value] of Object.entries(patch)) {
    if (COLUMN[key]) {
      const [column, cast] = COLUMN[key];
      params.push(cast === "text[]" ? pgArray([...new Set(value)]) : value);
      sets.push(`${column} = $${params.length}${cast ? "::" + cast : ""}`);
    }
  }
  if (patch.tourDone) sets.push("tour_done_at = coalesce(tour_done_at, now())");
  if (patch.settings) {
    params.push(JSON.stringify(patch.settings));
    sets.push(`settings = settings || $${params.length}::jsonb`);
  }
  if (sets.length) {
    sets.push("updated_at = now()");
    await ctx.db.query(`update profiles set ${sets.join(", ")} where user_id = $1`, params);
  }
  const rows = await ctx.db.query(`select ${PROFILE_FIELDS} from profiles where user_id = $1`, [ctx.user.id]);
  return profileJson(rows[0]);
}

const activityFields = {
  category: z.enum(ACTIVITY_CATEGORIES).nullable().optional(),
  title: z.string().trim().min(1, "Give it a name.").max(100, "Names can be up to 100 characters."),
  role: z.string().trim().max(LIMITS.position, `Positions can be up to ${LIMITS.position} characters.`).nullable().optional(),
  organization: z.string().trim().max(LIMITS.organization, `Organization names can be up to ${LIMITS.organization} characters.`).nullable().optional(),
  description: z.string().trim().max(LIMITS.description, `Descriptions can be up to ${LIMITS.description} characters.`).nullable().optional(),
  grades: z.array(z.number().int().min(9).max(12)).max(4).optional(),
  hoursPerWeek: z.number().min(0).max(80).nullable().optional(),
  weeksPerYear: z.number().int().min(0).max(52).nullable().optional(),
  recognition: z.enum(ids(HONOR_LEVELS)).nullable().optional(),
};
const activityBody = z.object({
  kind: z.enum(["activity", "honor"]).default("activity"),
  source: z.enum(["manual", "resume"]).default("manual"),
  ...activityFields,
});
const activityPatch = z.object(activityFields).partial().strict();

const ACTIVITY_COLUMNS = {
  category: "category", title: "title", role: "role", organization: "organization", description: "description",
  grades: "grades", hoursPerWeek: "hours_per_week", weeksPerYear: "weeks_per_year", recognition: "recognition",
};
const blank = (v) => (typeof v === "string" && !v.trim() ? null : v ?? null);

async function listActivities(ctx) {
  const rows = await ctx.db.query("select * from activities where user_id = $1 order by kind, position, created_at", [ctx.user.id]);
  return { items: rows.map(activityJson) };
}

async function createActivities(ctx) {
  const body = await ctx.body(40_000);
  const items = parseWith(z.array(activityBody).min(1).max(20), Array.isArray(body?.items) ? body.items : [body]);
  return ctx.db.tx(async (t) => {
    const counts = await t.query("select kind, count(*)::int as n, coalesce(max(position), -1) as top from activities where user_id = $1 group by kind", [ctx.user.id]);
    const have = Object.fromEntries(counts.map((r) => [r.kind, r]));
    const adding = { activity: items.filter((i) => i.kind === "activity").length, honor: items.filter((i) => i.kind === "honor").length };
    if ((have.activity?.n ?? 0) + adding.activity > LIMITS.activities || (have.honor?.n ?? 0) + adding.honor > LIMITS.honors)
      fail(400, `You can list up to ${LIMITS.activities} activities and ${LIMITS.honors} honors, like the Common App.`);
    const next = { activity: (have.activity?.top ?? -1) + 1, honor: (have.honor?.top ?? -1) + 1 };
    const created = [];
    for (const item of items) {
      const rows = await t.query(
        `insert into activities (user_id, kind, category, title, role, organization, description, grades, hours_per_week, weeks_per_year, recognition, source, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8::smallint[], $9, $10, $11, $12, $13) returning *`,
        [
          ctx.user.id, item.kind, item.category ?? null, item.title, blank(item.role), blank(item.organization), blank(item.description),
          pgArray(item.grades ?? []), item.hoursPerWeek ?? null, item.weeksPerYear ?? null, item.kind === "honor" ? item.recognition ?? null : null,
          item.source, next[item.kind]++,
        ],
      );
      created.push(activityJson(rows[0]));
    }
    return { items: created };
  });
}

async function patchActivity(ctx) {
  const patch = parseWith(activityPatch, await ctx.body(4000));
  const sets = [], params = [ctx.params.id, ctx.user.id];
  for (const [key, value] of Object.entries(patch)) {
    params.push(key === "grades" ? pgArray(value) : blank(value));
    sets.push(`${ACTIVITY_COLUMNS[key]} = $${params.length}${key === "grades" ? "::smallint[]" : ""}`);
  }
  if (!sets.length) fail(400, "Nothing to update.");
  const rows = await ctx.db.query(
    `update activities set ${sets.join(", ")}, updated_at = now() where id = $1 and user_id = $2 returning *`,
    params,
  );
  if (!rows.length) fail(404, "That activity isn't in your list.");
  return activityJson(rows[0]);
}

async function deleteActivity(ctx) {
  const rows = await ctx.db.query("delete from activities where id = $1 and user_id = $2 returning id", [ctx.params.id, ctx.user.id]);
  if (!rows.length) fail(404, "That activity isn't in your list.");
  return { deleted: true };
}

async function reorderActivities(ctx) {
  const { ids: order } = parseWith(z.object({ ids: z.array(z.uuid()).max(30) }), await ctx.body(4000));
  await ctx.db.tx(async (t) => {
    for (let i = 0; i < order.length; i++)
      await t.query("update activities set position = $3 where id = $1 and user_id = $2", [order[i], ctx.user.id, i]);
  });
  return listActivities(ctx);
}

async function tighten(ctx) {
  const input = parseWith(tightenInput, await ctx.body(1024));
  const [row] = await ctx.db.query("select * from activities where id = $1 and user_id = $2", [ctx.params.id, ctx.user.id]);
  if (!row) fail(404, "That activity isn't in your list.");
  if (!row.description && !row.role) fail(400, "Write a description first, then Sparrow can help you tighten it.");
  const { data, providerRequestId } = await callModel(ctx, {
    kind: "tighten",
    requestId: input.requestId,
    tier: "fast",
    system: TIGHTEN,
    user: { activity: { name: row.title, position: row.role, organization: row.organization, description: row.description } },
    schema: tightenOutput,
    maxTokens: 500,
    temperature: 0.6,
  });
  return { options: data.options, providerRequestId };
}

export default [
  { method: "GET", path: "/api/profile", access: "app", handler: getProfile },
  { method: "PATCH", path: "/api/profile", access: "app", handler: patchProfile },
  { method: "GET", path: "/api/activities", access: "app", handler: listActivities },
  { method: "POST", path: "/api/activities", access: "app", handler: createActivities, limit: 40_000 },
  { method: "POST", path: "/api/activities/reorder", access: "app", handler: reorderActivities },
  { method: "PATCH", path: "/api/activities/:id", access: "app", handler: patchActivity },
  { method: "DELETE", path: "/api/activities/:id", access: "app", handler: deleteActivity },
  { method: "POST", path: "/api/activities/:id/tighten", access: "app", handler: tighten },
];
