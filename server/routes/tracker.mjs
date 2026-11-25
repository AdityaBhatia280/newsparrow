// Plan: saved opportunities with application status, personal tasks, and the calendar export.
import { z } from "zod";
import { ROADMAP, STATUSES, TERMS, ids } from "../../shared/taxonomy.mjs";
import { checkUrl } from "../safe-fetch.mjs";
import { buildCalendar } from "../ics.mjs";
import { fail, parseWith, respond } from "../http.mjs";
import { OPPORTUNITY_FIELDS, iso, opportunityCard, taskJson } from "../models.mjs";
import { roadmapKey } from "../plan.mjs";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").refine((v) => !Number.isNaN(Date.parse(v)), "Use a valid date.");

// Saved-item columns are aliased (s_*) so they never collide with the opportunity's own columns.
const SAVED_SELECT = `select s.id as s_id, s.opportunity_id, s.title as s_title, s.url as s_url, s.provider as s_provider,
    s.status as s_status, s.note as s_note, s.personal_due::text as s_personal_due, s.created_at as s_created_at,
    s.updated_at as s_updated_at, ${OPPORTUNITY_FIELDS}
  from saved_items s left join opportunities o on o.id = s.opportunity_id`;

function savedJson(row, tasks = []) {
  const opportunity = row.opportunity_id ? opportunityCard({ ...row, saved_id: row.s_id, saved_status: row.s_status }) : null;
  return {
    id: row.s_id,
    status: row.s_status,
    note: row.s_note,
    personalDue: row.s_personal_due,
    title: opportunity?.title ?? row.s_title,
    provider: opportunity?.provider ?? row.s_provider,
    url: opportunity?.officialUrl ?? row.s_url,
    opportunity,
    tasks,
    createdAt: iso(row.s_created_at),
    updatedAt: iso(row.s_updated_at),
  };
}

const TASK_SELECT = `select t.id, t.title, t.due::text as due, t.done_at, t.saved_id, t.source, t.plan_key, t.created_at,
    coalesce(o.title, s.title) as saved_title
  from tasks t left join saved_items s on s.id = t.saved_id left join opportunities o on o.id = s.opportunity_id`;

async function listSaved(ctx) {
  const rows = await ctx.db.query(`${SAVED_SELECT} where s.user_id = $1 order by s.updated_at desc`, [ctx.user.id]);
  const tasks = await ctx.db.query(`${TASK_SELECT} where t.user_id = $1 and t.saved_id is not null order by t.done_at nulls first, t.due nulls last, t.created_at`, [ctx.user.id]);
  const bySaved = Map.groupBy(tasks.map(taskJson), (t) => t.savedId);
  return { items: rows.map((r) => savedJson(r, bySaved.get(r.s_id) || [])) };
}

const savedBody = z.union([
  z.object({ opportunityId: z.uuid(), status: z.enum(ids(STATUSES)).optional() }),
  z.object({
    title: z.string().trim().min(2, "Give it a name.").max(180),
    url: z.string().trim().max(2000).optional().nullable(),
    provider: z.string().trim().max(180).optional().nullable(),
    status: z.enum(ids(STATUSES)).optional(),
  }),
]);

async function createSaved(ctx) {
  const body = parseWith(savedBody, await ctx.body(4000), "Choose an opportunity to save.");
  let rows;
  if (body.opportunityId) {
    const [opportunity] = await ctx.db.query("select id from opportunities where id = $1 and status = 'approved'", [body.opportunityId]);
    if (!opportunity) fail(404, "That opportunity isn't in Sparrow's catalog.");
    await ctx.db.query(
      `insert into saved_items (user_id, opportunity_id, status) values ($1, $2, $3)
       on conflict (user_id, opportunity_id) do update set status = case when $4::boolean then excluded.status else saved_items.status end, updated_at = now()`,
      [ctx.user.id, body.opportunityId, body.status ?? "interested", !!body.status],
    );
    rows = await ctx.db.query(`${SAVED_SELECT} where s.user_id = $1 and s.opportunity_id = $2`, [ctx.user.id, body.opportunityId]);
  } else {
    let url = null;
    if (body.url) {
      const checked = checkUrl(body.url);
      if (!checked.ok) fail(400, checked.reason);
      url = checked.url.href;
    }
    const [count] = await ctx.db.query("select count(*)::int as n from saved_items where user_id = $1 and opportunity_id is null", [ctx.user.id]);
    if (count.n >= 100) fail(400, "You can keep up to 100 personal items. Remove a few first.");
    const [created] = await ctx.db.query(
      "insert into saved_items (user_id, title, url, provider, status) values ($1, $2, $3, $4, $5) returning id",
      [ctx.user.id, body.title, url, body.provider || null, body.status ?? "interested"],
    );
    rows = await ctx.db.query(`${SAVED_SELECT} where s.id = $1`, [created.id]);
  }
  return respond(201, savedJson(rows[0]));
}

const savedPatch = z
  .object({
    status: z.enum(ids(STATUSES)),
    note: z.string().max(2000, "Notes can be up to 2,000 characters."),
    personalDue: date.nullable(),
  })
  .partial()
  .strict();

async function patchSaved(ctx) {
  const patch = parseWith(savedPatch, await ctx.body(6000));
  const rows = await ctx.db.query(
    `update saved_items set status = coalesce($3, status), note = coalesce($4, note),
       personal_due = case when $5::boolean then $6::date else personal_due end, updated_at = now()
     where id = $1 and user_id = $2 returning id`,
    [ctx.params.id, ctx.user.id, patch.status ?? null, patch.note ?? null, "personalDue" in patch, patch.personalDue ?? null],
  );
  if (!rows.length) fail(404, "That item isn't in your plan.");
  const [row] = await ctx.db.query(`${SAVED_SELECT} where s.id = $1`, [ctx.params.id]);
  const tasks = await ctx.db.query(`${TASK_SELECT} where t.saved_id = $1 order by t.done_at nulls first, t.due nulls last, t.created_at`, [ctx.params.id]);
  return savedJson(row, tasks.map(taskJson));
}

async function deleteSaved(ctx) {
  const rows = await ctx.db.query("delete from saved_items where id = $1 and user_id = $2 returning id", [ctx.params.id, ctx.user.id]);
  if (!rows.length) fail(404, "That item isn't in your plan.");
  return { deleted: true };
}

async function listTasks(ctx) {
  const rows = await ctx.db.query(`${TASK_SELECT} where t.user_id = $1 order by t.done_at nulls first, t.due nulls last, t.created_at`, [ctx.user.id]);
  return { items: rows.map(taskJson) };
}

const ROADMAP_KEY = /^roadmap:(9|10|11|12):(fall|spring|summer):(\d)$/;
const taskBody = z.object({
  title: z.string().trim().min(1, "Write the task first.").max(200, "Tasks can be up to 200 characters."),
  due: date.nullable().optional(),
  savedId: z.uuid().nullable().optional(),
  source: z.enum(["manual", "advisor"]).default("manual"),
  planKey: z.string().regex(ROADMAP_KEY).optional(),
});

async function createTask(ctx) {
  const body = parseWith(taskBody, await ctx.body(2000));
  if (body.savedId) {
    const [owned] = await ctx.db.query("select id from saved_items where id = $1 and user_id = $2", [body.savedId, ctx.user.id]);
    if (!owned) fail(404, "That item isn't in your plan.");
  }
  let title = body.title, source = body.source;
  if (body.planKey) {
    const [, grade, term, index] = ROADMAP_KEY.exec(body.planKey);
    const text = ROADMAP[grade]?.terms[term]?.[Number(index)];
    if (!text || body.planKey !== roadmapKey(grade, term, index)) fail(400, "That roadmap step doesn't exist.");
    title = text;
    source = "plan";
  }
  const [count] = await ctx.db.query("select count(*)::int as n from tasks where user_id = $1 and done_at is null", [ctx.user.id]);
  if (count.n >= 300) fail(400, "You have a lot of open tasks. Finish or remove a few first.");
  const rows = await ctx.db.query(
    `insert into tasks (user_id, title, due, saved_id, source, plan_key) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, plan_key) do update set title = tasks.title returning id`,
    [ctx.user.id, title, body.due ?? null, body.savedId ?? null, source, body.planKey ?? null],
  );
  const [row] = await ctx.db.query(`${TASK_SELECT} where t.id = $1`, [rows[0].id]);
  return respond(201, taskJson(row));
}

const taskPatch = z
  .object({ title: z.string().trim().min(1).max(200), due: date.nullable(), done: z.boolean() })
  .partial()
  .strict();

async function patchTask(ctx) {
  const patch = parseWith(taskPatch, await ctx.body(2000));
  const rows = await ctx.db.query(
    `update tasks set title = coalesce($3, title),
       due = case when $4::boolean then $5::date else due end,
       done_at = case when $6::boolean is null then done_at when $6::boolean then coalesce(done_at, now()) else null end
     where id = $1 and user_id = $2 returning id`,
    [ctx.params.id, ctx.user.id, patch.title ?? null, "due" in patch, patch.due ?? null, patch.done ?? null],
  );
  if (!rows.length) fail(404, "That task isn't in your plan.");
  const [row] = await ctx.db.query(`${TASK_SELECT} where t.id = $1`, [ctx.params.id]);
  return taskJson(row);
}

async function deleteTask(ctx) {
  const rows = await ctx.db.query("delete from tasks where id = $1 and user_id = $2 returning id", [ctx.params.id, ctx.user.id]);
  if (!rows.length) fail(404, "That task isn't in your plan.");
  return { deleted: true };
}

async function roadmap(ctx) {
  const rows = await ctx.db.query("select plan_key, done_at from tasks where user_id = $1 and plan_key is not null", [ctx.user.id]);
  const added = Object.fromEntries(rows.map((r) => [r.plan_key, { done: !!r.done_at }]));
  return { roadmap: ROADMAP, terms: TERMS, added };
}

async function calendar(ctx) {
  const uid = ctx.user.id;
  const [tasks, saved] = await Promise.all([
    ctx.db.query(`${TASK_SELECT} where t.user_id = $1 and t.due is not null and t.done_at is null`, [uid]),
    ctx.db.query(
      `select s.id, coalesce(o.title, s.title) as title, s.personal_due::text as personal_due, o.deadline::text as deadline,
              o.facts_verified_at, coalesce(o.official_url, s.url) as url
         from saved_items s left join opportunities o on o.id = s.opportunity_id where s.user_id = $1`,
      [uid],
    ),
  ]);
  const events = [
    ...tasks.map((t) => ({ uid: "task-" + t.id, date: t.due, title: t.title, description: t.saved_title ? `For ${t.saved_title}` : "Sparrow task" })),
    ...saved
      .filter((s) => s.personal_due)
      .map((s) => ({ uid: "due-" + s.id, date: s.personal_due, title: `${s.title}: my target date`, url: s.url, description: "Your personal date in Sparrow." })),
    ...saved
      .filter((s) => s.deadline && s.facts_verified_at)
      .map((s) => ({ uid: "deadline-" + s.id, date: s.deadline, title: `${s.title}: deadline`, url: s.url, description: "Confirm the deadline and its time zone on the official site." })),
  ];
  return respond(200, buildCalendar(events, ctx.services.now()), {
    raw: true,
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="sparrow-plan.ics"' },
  });
}

export default [
  { method: "GET", path: "/api/saved", access: "app", handler: listSaved },
  { method: "POST", path: "/api/saved", access: "app", handler: createSaved },
  { method: "PATCH", path: "/api/saved/:id", access: "app", handler: patchSaved },
  { method: "DELETE", path: "/api/saved/:id", access: "app", handler: deleteSaved },
  { method: "GET", path: "/api/tasks", access: "app", handler: listTasks },
  { method: "POST", path: "/api/tasks", access: "app", handler: createTask },
  { method: "PATCH", path: "/api/tasks/:id", access: "app", handler: patchTask },
  { method: "DELETE", path: "/api/tasks/:id", access: "app", handler: deleteTask },
  { method: "GET", path: "/api/roadmap", access: "app", handler: roadmap },
  { method: "GET", path: "/api/calendar.ics", access: "app", handler: calendar },
];
