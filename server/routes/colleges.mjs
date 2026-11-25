// College Explorer: U.S. Department of Education College Scorecard records and the student's shortlist.
import { z } from "zod";
import { COLLEGE_TAGS, STATES, ids } from "../../shared/taxonomy.mjs";
import { fail, parseWith } from "../http.mjs";
import { COLLEGE_FIELDS, collegeCard, collegeDetail, loadMatchProfile } from "../models.mjs";

const PAGE = 24;
const SIZES = { small: [0, 4999], medium: [5000, 14999], large: [15000, 10_000_000] };
const like = (q) => "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.enum(STATES.map(([c]) => c)).optional(),
  size: z.enum(["small", "medium", "large"]).optional(),
  control: z.enum(["public", "private"]).optional(),
  maxNet: z.coerce.number().int().min(1000).max(100_000).optional(),
  shortlisted: z.enum(["1"]).optional(),
  sort: z.enum(["match", "name", "net_price", "size"]).default("match"),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

async function source(db) {
  const [row] = await db.query("select max(source_retrieved_at)::text as retrieved, count(*)::int as total from colleges");
  return { name: "U.S. Department of Education College Scorecard", url: "https://collegescorecard.ed.gov/", retrieved: row?.retrieved ?? null, total: row?.total ?? 0 };
}

async function list(ctx) {
  const f = parseWith(listQuery, Object.fromEntries([...ctx.query].filter(([, v]) => v !== "")), "Check the filters and try again.");
  const where = ["c.ownership in (1, 2)"];
  const params = [ctx.user.id];
  const add = (sql, ...values) => {
    let out = sql;
    for (const v of values) {
      params.push(v);
      out = out.replace("?", "$" + params.length);
    }
    where.push(out);
  };
  if (f.q) {
    params.push(like(f.q));
    where.push(`(c.name ilike $${params.length} or c.city ilike $${params.length})`);
  }
  if (f.state) add("c.state = ?", f.state);
  if (f.size) add("c.size between ? and ?", ...SIZES[f.size]);
  if (f.control) where.push(f.control === "public" ? "c.ownership = 1" : "c.ownership = 2");
  if (f.maxNet) add("c.net_price <= ?", f.maxNet);
  if (f.shortlisted) where.push("s.college_id is not null");
  const rows = await ctx.db.query(
    `select ${COLLEGE_FIELDS}, s.tag, s.note from colleges c
       left join college_shortlist s on s.college_id = c.id and s.user_id = $1
      where ${where.join(" and ")}`,
    params,
  );
  const profile = await loadMatchProfile(ctx.db, ctx.user.id);
  const items = rows.map((r) => collegeCard(r, profile));
  const byName = (a, b) => a.name.localeCompare(b.name);
  const sorters = {
    match: (a, b) => b.match.score - a.match.score || byName(a, b),
    name: byName,
    net_price: (a, b) => (a.netPrice ?? 1e9) - (b.netPrice ?? 1e9) || byName(a, b),
    size: (a, b) => (b.size ?? 0) - (a.size ?? 0) || byName(a, b),
  };
  items.sort(sorters[f.sort]);
  return {
    items: items.slice(f.offset, f.offset + PAGE),
    total: items.length,
    nextOffset: f.offset + PAGE < items.length ? f.offset + PAGE : null,
    source: await source(ctx.db),
  };
}

async function detail(ctx) {
  const rows = await ctx.db.query(
    `select ${COLLEGE_FIELDS}, s.tag, s.note from colleges c
       left join college_shortlist s on s.college_id = c.id and s.user_id = $1 where c.id = $2`,
    [ctx.user.id, Number(ctx.params.id)],
  );
  if (!rows.length) fail(404, "That college isn't in Sparrow's directory.");
  return { ...collegeDetail(rows[0], await loadMatchProfile(ctx.db, ctx.user.id)), source: await source(ctx.db) };
}

async function shortlist(ctx) {
  const rows = await ctx.db.query(
    `select ${COLLEGE_FIELDS}, s.tag, s.note from college_shortlist s join colleges c on c.id = s.college_id
      where s.user_id = $1 order by s.created_at`,
    [ctx.user.id],
  );
  return { items: rows.map((r) => collegeCard(r)) };
}

const shortlistBody = z
  .object({ tag: z.enum(ids(COLLEGE_TAGS)), note: z.string().max(2000, "Notes can be up to 2,000 characters.") })
  .partial()
  .strict();

async function putShortlist(ctx) {
  const body = parseWith(shortlistBody, await ctx.body(6000));
  const id = Number(ctx.params.id);
  const [college] = await ctx.db.query("select id from colleges where id = $1", [id]);
  if (!college) fail(404, "That college isn't in Sparrow's directory.");
  const [state] = await ctx.db.query(
    `select count(*)::int as n, bool_or(college_id = $2) as present from college_shortlist where user_id = $1`,
    [ctx.user.id, id],
  );
  if (!state.present && state.n >= 60) fail(400, "Your shortlist can hold up to 60 colleges.");
  await ctx.db.query(
    `insert into college_shortlist (user_id, college_id, tag, note) values ($1, $2, coalesce($3, 'considering'), coalesce($4, ''))
     on conflict (user_id, college_id) do update set tag = coalesce($3, college_shortlist.tag), note = coalesce($4, college_shortlist.note)`,
    [ctx.user.id, id, body.tag ?? null, body.note ?? null],
  );
  return detail(ctx);
}

async function deleteShortlist(ctx) {
  const rows = await ctx.db.query("delete from college_shortlist where user_id = $1 and college_id = $2 returning college_id", [ctx.user.id, Number(ctx.params.id)]);
  if (!rows.length) fail(404, "That college isn't on your shortlist.");
  return { deleted: true };
}

export default [
  { method: "GET", path: "/api/colleges", access: "app", handler: list },
  { method: "GET", path: "/api/colleges/:id", access: "app", handler: detail, idType: "int" },
  { method: "GET", path: "/api/shortlist", access: "app", handler: shortlist },
  { method: "PUT", path: "/api/shortlist/:id", access: "app", handler: putShortlist, idType: "int" },
  { method: "DELETE", path: "/api/shortlist/:id", access: "app", handler: deleteShortlist, idType: "int" },
];
