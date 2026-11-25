// Reviewer tools (SPARROW_ADMIN_EMAILS only): the submission queue, catalog management, source re-checks, audit log.
import { z } from "zod";
import { FORMATS, INTERESTS, OPPORTUNITY_TYPES, ids } from "../../shared/taxonomy.mjs";
import { confirmation } from "../ai/schemas.mjs";
import { pgArray } from "../db/index.mjs";
import { fail, parseWith, respond } from "../http.mjs";
import { OPPORTUNITY_FIELDS, iso, opportunityDetail, submissionJson } from "../models.mjs";
import { checkUrl } from "../safe-fetch.mjs";
import { SUBMISSION_SELECT, extractFromSource } from "./contrib.mjs";

const POINTS = { contribution: 50, correction: 20 };
const DAILY_POINT_CAP = 200;

const fieldsSchema = z.object({
  title: z.string().trim().min(2, "Add a title.").max(180),
  provider: z.string().trim().min(2, "Add the organization.").max(180),
  type: z.enum(ids(OPPORTUNITY_TYPES)),
  interests: z.array(z.enum(ids(INTERESTS))).max(6).default([]),
  grades: z.array(z.number().int().min(9).max(12)).max(4).default([]),
  format: z.enum(ids(FORMATS)).default("varies"),
  location: z.string().trim().max(120).nullable().optional(),
  cost: z.enum(["free", "paid", "varies", "unknown"]).default("unknown"),
  summary: z.string().trim().min(10, "Add a short summary.").max(600),
  officialUrl: z.string().trim().max(2000).refine((u) => checkUrl(u).ok, "Use the official https link."),
  eligibility: z.string().trim().max(400).nullable().optional(),
  timeCommitment: z.string().trim().max(160).nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deadlineNote: z.string().trim().max(200).nullable().optional(),
});
const evidenceSchema = z.array(z.object({ field: z.string().max(40), excerpt: z.string().trim().min(1).max(400) })).max(20).default([]);

function slugify(title) {
  return String(title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "opportunity";
}

async function uniqueSlug(t, title) {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const [taken] = await t.query("select 1 from opportunities where slug = $1", [slug]);
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const blank = (v) => (typeof v === "string" && !v.trim() ? null : v ?? null);
const fieldParams = (f) => [
  f.title, f.provider, f.type, pgArray(f.interests), pgArray(f.grades), f.format, blank(f.location), f.cost, f.summary,
  checkUrl(f.officialUrl).url.href, blank(f.eligibility), blank(f.timeCommitment), f.deadline ?? null, blank(f.deadlineNote),
];

async function insertOpportunity(t, f, { createdBy, verifiedBy, verified }) {
  const slug = await uniqueSlug(t, f.title);
  const [row] = await t.query(
    `insert into opportunities (slug, title, provider, type, interests, grades, format, location, cost, summary, official_url,
       eligibility, time_commitment, deadline, deadline_note, created_by, verified_by, facts_verified_at, link_checked_at)
     values ($1, $2, $3, $4, $5::text[], $6::smallint[], $7, $8, $9, $10, $11, $12, $13, $14::date, $15, $16, $17,
       case when $18::boolean then now() end, now()) returning id, slug`,
    [slug, ...fieldParams(f), createdBy, verifiedBy, verified],
  );
  return row;
}

async function updateOpportunity(t, id, f, { verifiedBy, verified }) {
  const rows = await t.query(
    `update opportunities set title = $2, provider = $3, type = $4, interests = $5::text[], grades = $6::smallint[], format = $7,
       location = $8, cost = $9, summary = $10, official_url = $11, eligibility = $12, time_commitment = $13, deadline = $14::date,
       deadline_note = $15, verified_by = case when $17::boolean then $16 else verified_by end,
       facts_verified_at = case when $17::boolean then now() else facts_verified_at end, updated_at = now()
     where id = $1 returning id, slug`,
    [id, ...fieldParams(f), verifiedBy, verified],
  );
  if (!rows.length) fail(404, "That listing doesn't exist.");
  return rows[0];
}

async function addEvidence(t, opportunityId, evidence, sourceUrl, reviewerId) {
  if (!evidence.length) return;
  await t.query("delete from opportunity_evidence where opportunity_id = $1", [opportunityId]);
  for (const e of evidence)
    await t.query(
      "insert into opportunity_evidence (opportunity_id, field, excerpt, source_url, reviewer_id) values ($1, $2, $3, $4, $5)",
      [opportunityId, e.field, e.excerpt, sourceUrl, reviewerId],
    );
}

const audit = (t, actor, action, type, id, detail = {}) =>
  t.query("insert into audit_events (actor_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5::jsonb)", [
    actor, action, type, String(id), JSON.stringify(detail),
  ]);

async function queue(ctx) {
  const rows = await ctx.db.query(
    `${SUBMISSION_SELECT.replace("from submissions sb", ", coalesce(p.first_name, u.display_name, 'A student') as submitter_name from submissions sb join app_users u on u.id = sb.user_id left join profiles p on p.user_id = sb.user_id")}
      where sb.status = 'pending' order by sb.updated_at limit 50`,
  );
  const [counts] = await ctx.db.query(
    `select count(*) filter (where status = 'pending')::int as pending, count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'needs_changes')::int as needs_changes from submissions`,
  );
  return { items: rows.map(submissionJson), counts };
}

const decisionBody = z.object({
  decision: z.enum(["approve", "needs_changes", "reject", "duplicate"]),
  reason: z.string().trim().max(500).optional().default(""),
  fields: fieldsSchema.optional(),
});

async function decide(ctx) {
  const body = parseWith(decisionBody, await ctx.body(12_000));
  if (body.decision !== "approve" && body.reason.length < 3) fail(400, "Add a short reason so the student knows what to change.");
  if (body.decision === "approve" && !body.fields) fail(400, "Review the listing fields before approving.");
  const result = await ctx.db.tx(async (t) => {
    const [row] = await t.query("select * from submissions where id = $1 for update", [ctx.params.id]);
    if (!row) fail(404, "That submission doesn't exist.");
    if (row.status !== "pending") fail(409, "This submission was already reviewed.");
    let opportunity = null, reward = null;
    if (body.decision === "approve") {
      const evidence = (row.evidence || []).filter((e) => e?.field && e?.excerpt);
      opportunity = row.correction_of
        ? await updateOpportunity(t, row.correction_of, body.fields, { verifiedBy: ctx.user.id, verified: evidence.length > 0 })
        : await insertOpportunity(t, body.fields, { createdBy: row.user_id, verifiedBy: ctx.user.id, verified: evidence.length > 0 });
      await addEvidence(t, opportunity.id, evidence, row.url, ctx.user.id);
      const kind = row.correction_of ? "correction" : "contribution";
      const [today] = await t.query(
        "select coalesce(sum(points), 0)::int as total from reward_transactions where user_id = $1 and created_at > now() - interval '1 day'",
        [row.user_id],
      );
      const points = Math.min(POINTS[kind], Math.max(0, DAILY_POINT_CAP - today.total));
      if (points > 0) {
        const [inserted] = await t.query(
          `insert into reward_transactions (user_id, kind, points, reason, reference, idempotency_key, created_by)
           values ($1, $2, $3, $4, $5, $6, $7) on conflict (idempotency_key) do nothing returning id, points`,
          [row.user_id, kind, points, `${kind === "correction" ? "Correction" : "New listing"} approved: ${body.fields.title}`, opportunity.slug, "submission:" + row.id, ctx.user.id],
        );
        reward = inserted ?? null;
      }
    }
    const status = { approve: "approved", needs_changes: "needs_changes", reject: "rejected", duplicate: "duplicate" }[body.decision];
    await t.query(
      `update submissions set status = $2, reviewer_id = $3, decision_reason = $4, decided_at = now(), opportunity_id = coalesce($5, opportunity_id), updated_at = now()
       where id = $1`,
      [row.id, status, ctx.user.id, body.reason || null, opportunity?.id ?? null],
    );
    await audit(t, ctx.user.id, "submission." + status, "submission", row.id, { opportunity: opportunity?.slug ?? null, points: reward?.points ?? 0 });
    return { opportunity, reward };
  });
  const [full] = await ctx.db.query(`${SUBMISSION_SELECT} where sb.id = $1`, [ctx.params.id]);
  return { submission: submissionJson(full), opportunity: result.opportunity, reward: result.reward };
}

async function listOpportunities(ctx) {
  const q = (ctx.query.get("q") || "").trim().slice(0, 100);
  const status = ctx.query.get("status") === "archived" ? "archived" : ctx.query.get("status") === "all" ? null : "approved";
  const rows = await ctx.db.query(
    `select ${OPPORTUNITY_FIELDS}, (select count(*)::int from saved_items s where s.opportunity_id = o.id) as saves from opportunities o
      where ($1::text is null or o.status = $1) and ($2 = '' or o.title ilike '%' || $2 || '%' or o.provider ilike '%' || $2 || '%')
      order by o.title limit 300`,
    [status, q.replace(/[\\%_]/g, "")],
  );
  return { items: rows.map((r) => ({ ...opportunityDetail(r), saves: r.saves })) };
}

const createBody = z.object({ fields: fieldsSchema, evidence: evidenceSchema, verify: z.boolean().default(false) });

async function createOpportunity(ctx) {
  const body = parseWith(createBody, await ctx.body(12_000));
  const row = await ctx.db.tx(async (t) => {
    const created = await insertOpportunity(t, body.fields, { createdBy: ctx.user.id, verifiedBy: ctx.user.id, verified: body.verify });
    if (body.verify) await addEvidence(t, created.id, body.evidence, body.fields.officialUrl, ctx.user.id);
    await audit(t, ctx.user.id, "opportunity.created", "opportunity", created.id, { slug: created.slug });
    return created;
  });
  return respond(201, row);
}

const patchBody = z.object({
  fields: fieldsSchema.optional(),
  evidence: evidenceSchema,
  verify: z.boolean().default(false),
  status: z.enum(["approved", "archived"]).optional(),
});

async function patchOpportunity(ctx) {
  const body = parseWith(patchBody, await ctx.body(12_000));
  const row = await ctx.db.tx(async (t) => {
    const [current] = await t.query("select id, slug, official_url from opportunities where id = $1", [ctx.params.id]);
    if (!current) fail(404, "That listing doesn't exist.");
    if (body.fields) await updateOpportunity(t, current.id, body.fields, { verifiedBy: ctx.user.id, verified: body.verify });
    if (body.verify) await addEvidence(t, current.id, body.evidence, body.fields?.officialUrl ?? current.official_url, ctx.user.id);
    if (body.status) await t.query("update opportunities set status = $2, updated_at = now() where id = $1", [current.id, body.status]);
    await audit(t, ctx.user.id, body.status === "archived" ? "opportunity.archived" : "opportunity.updated", "opportunity", current.id, {
      verified: body.verify,
      status: body.status ?? null,
    });
    const [full] = await t.query(`select ${OPPORTUNITY_FIELDS} from opportunities o where o.id = $1`, [current.id]);
    return full;
  });
  return opportunityDetail(row);
}

async function recheck(ctx) {
  const input = parseWith(z.object(confirmation), await ctx.body(1024));
  const [row] = await ctx.db.query("select official_url from opportunities where id = $1", [ctx.params.id]);
  if (!row) fail(404, "That listing doesn't exist.");
  const result = await extractFromSource(ctx, row.official_url, input.requestId);
  await ctx.db.query("update opportunities set link_checked_at = now() where id = $1", [ctx.params.id]);
  return { fields: result.values, evidence: result.evidence, flags: result.flags, pageTitle: result.page.title, fetchedUrl: result.page.url };
}

async function auditLog(ctx) {
  const rows = await ctx.db.query(
    `select a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at, coalesce(p.first_name, u.display_name) as actor
       from audit_events a left join app_users u on u.id = a.actor_id left join profiles p on p.user_id = a.actor_id
      order by a.created_at desc limit 100`,
  );
  return { items: rows.map((r) => ({ id: r.id, action: r.action, targetType: r.target_type, targetId: r.target_id, detail: r.detail, actor: r.actor, createdAt: iso(r.created_at) })) };
}

async function stats(ctx) {
  const [row] = await ctx.db.query(
    `select (select count(*)::int from app_users) as users,
            (select count(*)::int from profiles where onboarded_at is not null) as onboarded,
            (select count(*)::int from opportunities where status = 'approved') as opportunities,
            (select count(*)::int from opportunities where status = 'approved' and facts_verified_at is not null) as verified,
            (select count(*)::int from colleges) as colleges,
            (select count(*)::int from submissions where status = 'pending') as pending`,
  );
  return row;
}

export default [
  { method: "GET", path: "/api/admin/queue", access: "admin", handler: queue },
  { method: "POST", path: "/api/admin/submissions/:id/decision", access: "admin", handler: decide },
  { method: "GET", path: "/api/admin/opportunities", access: "admin", handler: listOpportunities },
  { method: "POST", path: "/api/admin/opportunities", access: "admin", handler: createOpportunity },
  { method: "PATCH", path: "/api/admin/opportunities/:id", access: "admin", handler: patchOpportunity },
  { method: "POST", path: "/api/admin/opportunities/:id/recheck", access: "admin", handler: recheck },
  { method: "GET", path: "/api/admin/audit", access: "admin", handler: auditLog },
  { method: "GET", path: "/api/admin/stats", access: "admin", handler: stats },
];
