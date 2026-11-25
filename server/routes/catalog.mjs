// Explore: the reviewed opportunity catalog, AI web discovery, and the Home overview.
import { z } from "zod";
import { COSTS, FORMATS, INTERESTS, OPPORTUNITY_TYPES, ids } from "../../shared/taxonomy.mjs";
import { normalizeUrl } from "../../shared/text.mjs";
import { webSearch } from "../ai/client.mjs";
import { confirmation, input as aiText } from "../ai/schemas.mjs";
import { fail, parseWith } from "../http.mjs";
import { COLLEGE_FIELDS, OPPORTUNITY_FIELDS, collegeCard, iso, loadMatchProfile, opportunityCard, opportunityDetail, taskJson } from "../models.mjs";

const PAGE = 24;
const like = (q) => "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(ids(OPPORTUNITY_TYPES)).optional(),
  interest: z.enum(ids(INTERESTS)).optional(),
  grade: z.coerce.number().int().min(9).max(12).optional(),
  format: z.enum(ids(FORMATS)).optional(),
  cost: z.enum(ids(COSTS)).optional(),
  within: z.coerce.number().int().min(1).max(365).optional(),
  matches: z.enum(["1"]).optional(),
  saved: z.enum(["1"]).optional(),
  sort: z.enum(["match", "deadline", "newest", "title"]).default("match"),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

async function list(ctx) {
  const f = parseWith(listQuery, Object.fromEntries([...ctx.query].filter(([, v]) => v !== "")), "Check the filters and try again.");
  const where = ["o.status = 'approved'"];
  const params = [ctx.user.id];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", "$" + params.length));
  };
  if (f.q) add("(o.title ilike ? or o.provider ilike ? or o.summary ilike ?)".replaceAll("?", "$" + (params.length + 1)), like(f.q));
  if (f.type) add("o.type = ?", f.type);
  if (f.interest) add("? = any(o.interests)", f.interest);
  if (f.grade) add("(cardinality(o.grades) = 0 or ?::smallint = any(o.grades))", f.grade);
  if (f.format) add("o.format = ?", f.format);
  if (f.cost) add("o.cost = ?", f.cost);
  if (f.within) add("o.deadline between current_date and current_date + ?::int", f.within);
  if (f.saved) where.push("s.id is not null");
  const rows = await ctx.db.query(
    `select ${OPPORTUNITY_FIELDS}, s.id as saved_id, s.status as saved_status from opportunities o
       left join saved_items s on s.opportunity_id = o.id and s.user_id = $1
      where ${where.join(" and ")}`,
    params,
  );
  const profile = await loadMatchProfile(ctx.db, ctx.user.id);
  let items = rows.map((r) => opportunityCard(r, profile));
  if (f.matches) items = items.filter((c) => c.match.eligible && c.match.score >= 38);
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const sorters = {
    match: (a, b) => b.match.score - a.match.score || byTitle(a, b),
    deadline: (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999") || byTitle(a, b),
    newest: (a, b) => String(b.factsVerifiedAt || b.linkCheckedAt || "").localeCompare(String(a.factsVerifiedAt || a.linkCheckedAt || "")) || byTitle(a, b),
    title: byTitle,
  };
  items.sort(sorters[f.sort]);
  const page = items.slice(f.offset, f.offset + PAGE);
  return { items: page, total: items.length, nextOffset: f.offset + PAGE < items.length ? f.offset + PAGE : null };
}

async function detail(ctx) {
  const rows = await ctx.db.query(
    `select ${OPPORTUNITY_FIELDS}, s.id as saved_id, s.status as saved_status from opportunities o
       left join saved_items s on s.opportunity_id = o.id and s.user_id = $1
      where o.slug = $2 and o.status = 'approved'`,
    [ctx.user.id, ctx.params.slug],
  );
  if (!rows.length) fail(404, "That opportunity isn't in Sparrow's catalog.");
  const profile = await loadMatchProfile(ctx.db, ctx.user.id);
  const item = opportunityDetail(rows[0], profile);
  const [evidence, saved, similarRows] = await Promise.all([
    ctx.db.query("select field, excerpt, source_url, captured_at from opportunity_evidence where opportunity_id = $1 order by field", [item.id]),
    item.saved
      ? ctx.db.query("select id, status, note, personal_due::text as personal_due from saved_items where id = $1", [item.saved.id])
      : [],
    ctx.db.query(
      `select ${OPPORTUNITY_FIELDS}, s.id as saved_id, s.status as saved_status from opportunities o
         left join saved_items s on s.opportunity_id = o.id and s.user_id = $1
        where o.status = 'approved' and o.id <> $2 and (o.type = $3 or o.interests && $4::text[])`,
      [ctx.user.id, item.id, item.type, "{" + item.interests.map((i) => `"${i}"`).join(",") + "}"],
    ),
  ]);
  item.evidence = evidence.map((e) => ({ field: e.field, excerpt: e.excerpt, sourceUrl: e.source_url, capturedAt: iso(e.captured_at) }));
  if (saved[0]) item.saved = { id: saved[0].id, status: saved[0].status, note: saved[0].note, personalDue: saved[0].personal_due };
  item.similar = similarRows
    .map((r) => opportunityCard(r, profile))
    .filter((c) => c.match.eligible)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 3);
  return item;
}

const discoverBody = z.object({ q: aiText(160).refine((s) => s.length >= 2, "Type what you're looking for."), ...confirmation });

async function discover(ctx) {
  const body = parseWith(discoverBody, await ctx.body(2048));
  const q = /high school|teen|student/i.test(body.q) ? body.q : `${body.q} for high school students`;
  const { results, providerRequestId } = await webSearch(ctx, { requestId: body.requestId, q, count: 10 });
  const known = await ctx.db.query("select slug, official_url from opportunities where status = 'approved'");
  const catalog = new Map(known.map((k) => [safeNormal(k.official_url), k.slug]));
  return {
    query: q,
    providerRequestId,
    results: results.map((r) => ({ ...r, catalogSlug: catalog.get(safeNormal(r.url)) ?? null })),
  };
}

function safeNormal(url) {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
}

async function home(ctx) {
  const uid = ctx.user.id;
  const [counts] = await ctx.db.query(
    `select (select count(*)::int from saved_items where user_id = $1) as saved,
            (select count(*)::int from saved_items where user_id = $1 and status = 'preparing') as preparing,
            (select count(*)::int from saved_items where user_id = $1 and status = 'submitted') as submitted,
            (select count(*)::int from college_shortlist where user_id = $1) as colleges,
            (select count(*)::int from activities where user_id = $1) as activities,
            (select count(*)::int from tasks where user_id = $1 and done_at is null and due < current_date) as overdue`,
    [uid],
  );
  const [taskRows, opportunityRows, deadlineRows, shortlistRows] = await Promise.all([
    ctx.db.query(
      `select t.*, t.due::text as due, coalesce(o.title, s.title) as saved_title from tasks t
         left join saved_items s on s.id = t.saved_id left join opportunities o on o.id = s.opportunity_id
        where t.user_id = $1 and t.done_at is null order by t.due nulls last, t.created_at limit 6`,
      [uid],
    ),
    ctx.db.query(
      `select ${OPPORTUNITY_FIELDS}, null::uuid as saved_id, null::text as saved_status from opportunities o
        where o.status = 'approved' and not exists (select 1 from saved_items s where s.user_id = $1 and s.opportunity_id = o.id)`,
      [uid],
    ),
    ctx.db.query(
      `select * from (
         select 'task' as kind, t.id::text as ref, t.title, t.due::text as date, null::text as slug from tasks t
          where t.user_id = $1 and t.done_at is null and t.due between current_date - 7 and current_date + 45
         union all
         select 'personal' as kind, s.id::text, coalesce(o.title, s.title), s.personal_due::text, o.slug from saved_items s
           left join opportunities o on o.id = s.opportunity_id
          where s.user_id = $1 and s.personal_due between current_date - 7 and current_date + 45
         union all
         select 'deadline' as kind, s.id::text, o.title, o.deadline::text, o.slug from saved_items s
           join opportunities o on o.id = s.opportunity_id
          where s.user_id = $1 and o.facts_verified_at is not null and o.deadline between current_date and current_date + 45
       ) d order by date limit 8`,
      [uid],
    ),
    ctx.db.query(
      `select ${COLLEGE_FIELDS}, s.tag, s.note from college_shortlist s join colleges c on c.id = s.college_id
        where s.user_id = $1 order by (s.tag = 'top_choice') desc, s.created_at limit 4`,
      [uid],
    ),
  ]);
  const profile = await loadMatchProfile(ctx.db, uid);
  const forYou = opportunityRows
    .map((r) => opportunityCard(r, profile))
    .filter((c) => c.match.eligible)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 8);
  return {
    counts,
    upNext: taskRows.map(taskJson),
    forYou,
    deadlines: deadlineRows,
    shortlist: shortlistRows.map((r) => collegeCard(r)),
  };
}

export default [
  { method: "GET", path: "/api/opportunities", access: "app", handler: list },
  { method: "GET", path: "/api/opportunities/:slug", access: "app", handler: detail },
  { method: "POST", path: "/api/discover", access: "app", handler: discover },
  { method: "GET", path: "/api/home", access: "app", handler: home },
];
