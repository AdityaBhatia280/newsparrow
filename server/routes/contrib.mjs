// Student contributions: submit an official link, extract a reviewable draft, send it for review. Plus rewards.
import { z } from "zod";
import { FORMATS, INTERESTS, OPPORTUNITY_TYPES, ids } from "../../shared/taxonomy.mjs";
import { cleanUrl, normalizeUrl } from "../../shared/text.mjs";
import { callModel } from "../ai/client.mjs";
import { EXTRACT } from "../ai/prompts.mjs";
import { confirmation, extractionOutput } from "../ai/schemas.mjs";
import { fail, parseWith, respond } from "../http.mjs";
import { iso, submissionJson } from "../models.mjs";
import { checkUrl } from "../safe-fetch.mjs";

export const SUBMISSION_SELECT = `select sb.*, o.slug as opportunity_slug, c.slug as correction_slug, c.title as correction_title
  from submissions sb left join opportunities o on o.id = sb.opportunity_id left join opportunities c on c.id = sb.correction_of`;

const EDITABLE = ["draft", "needs_changes"];

async function list(ctx) {
  const rows = await ctx.db.query(`${SUBMISSION_SELECT} where sb.user_id = $1 order by sb.updated_at desc`, [ctx.user.id]);
  return { items: rows.map(submissionJson) };
}

async function owned(ctx) {
  const [row] = await ctx.db.query(`${SUBMISSION_SELECT} where sb.id = $1 and sb.user_id = $2`, [ctx.params.id, ctx.user.id]);
  if (!row) fail(404, "That submission isn't in your list.");
  return row;
}

const createBody = z.object({
  url: z.string().trim().min(8, "Paste the official link.").max(2000),
  type: z.enum(ids(OPPORTUNITY_TYPES)).nullable().optional(),
  title: z.string().trim().max(180).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  correctionOf: z.string().trim().max(120).nullable().optional(),
});

async function create(ctx) {
  const body = parseWith(createBody, await ctx.body(6000));
  const checked = checkUrl(body.url);
  if (!checked.ok) fail(400, checked.reason);
  const url = cleanUrl(checked.url.href);
  const normalized = normalizeUrl(url);
  let correction = null;
  if (body.correctionOf) {
    [correction] = await ctx.db.query("select id from opportunities where slug = $1 or id::text = $1", [body.correctionOf]);
    if (!correction) fail(404, "The listing you're correcting isn't in Sparrow's catalog.");
  } else {
    const existing = await ctx.db.query("select slug, official_url from opportunities where status = 'approved'");
    const match = existing.find((o) => {
      try {
        return normalizeUrl(o.official_url) === normalized;
      } catch {
        return false;
      }
    });
    if (match) fail(409, "Sparrow already lists this opportunity. Open it from Explore, or suggest a correction there.", { slug: match.slug });
  }
  const [count] = await ctx.db.query(
    "select count(*)::int as n from submissions where user_id = $1 and created_at > now() - interval '1 day'",
    [ctx.user.id],
  );
  if (count.n >= 20) fail(429, "You've added a lot of submissions today. Come back tomorrow to add more.");
  try {
    const [row] = await ctx.db.query(
      `insert into submissions (user_id, url, normalized_url, type, title, notes, correction_of) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [ctx.user.id, url, normalized, body.type ?? null, body.title || null, body.notes ?? "", correction?.id ?? null],
    );
    const [full] = await ctx.db.query(`${SUBMISSION_SELECT} where sb.id = $1`, [row.id]);
    return respond(201, submissionJson(full));
  } catch (error) {
    if (error?.code === "23505") fail(409, "This link is already in your submissions. Edit it below.");
    throw error;
  }
}

const extractedFields = z
  .object({
    title: z.string().trim().max(180).nullable(),
    provider: z.string().trim().max(180).nullable(),
    type: z.enum(ids(OPPORTUNITY_TYPES)).nullable(),
    summary: z.string().trim().max(600).nullable(),
    eligibility: z.string().trim().max(400).nullable(),
    grades: z.array(z.number().int().min(9).max(12)).max(4),
    interests: z.array(z.enum(ids(INTERESTS))).max(6),
    format: z.enum(ids(FORMATS)).nullable(),
    location: z.string().trim().max(120).nullable(),
    cost: z.enum(["free", "paid", "varies"]).nullable(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    deadlineNote: z.string().trim().max(200).nullable(),
    timeCommitment: z.string().trim().max(160).nullable(),
  })
  .partial()
  .strict();

const patchBody = z
  .object({
    type: z.enum(ids(OPPORTUNITY_TYPES)).nullable(),
    title: z.string().trim().max(180).nullable(),
    notes: z.string().trim().max(2000),
    extracted: extractedFields,
  })
  .partial()
  .strict();

async function patch(ctx) {
  const row = await owned(ctx);
  if (!EDITABLE.includes(row.status)) fail(409, "This submission is with reviewers now, so it can't be edited.");
  const body = parseWith(patchBody, await ctx.body(10_000));
  const extracted = body.extracted ? { ...(row.extracted || {}), ...body.extracted } : row.extracted;
  await ctx.db.query(
    `update submissions set type = $3, title = $4, notes = $5, extracted = $6::jsonb, updated_at = now() where id = $1 and user_id = $2`,
    [
      row.id, ctx.user.id,
      "type" in body ? body.type : row.type,
      "title" in body ? body.title || null : row.title,
      body.notes ?? row.notes,
      extracted ? JSON.stringify(extracted) : null,
    ],
  );
  return submissionJson(await owned(ctx));
}

/** Fetches the page safely and asks AI for a draft whose every field quotes the page. Shared with admin re-checks. */
export async function extractFromSource(ctx, url, requestId) {
  const page = await ctx.services.fetchPage(url);
  if (!page.ok) fail(422, page.reason);
  const source = [page.title, page.description, page.text].filter(Boolean).join("\n");
  const { data, providerRequestId } = await callModel(ctx, {
    kind: "extract",
    requestId,
    tier: "fast",
    system: EXTRACT,
    user: { url: page.url, pageTitle: page.title, pageText: source },
    schema: extractionOutput(source),
    maxTokens: 1800,
    temperature: 0.1,
  });
  const values = {}, evidence = [];
  for (const [field, entry] of Object.entries(data.fields || {})) {
    if (!entry) continue;
    values[field] = entry.value;
    evidence.push({ field, excerpt: entry.evidence });
  }
  const flags = [...data.flags];
  if (values.deadline && values.deadline < new Date().toISOString().slice(0, 10)) flags.push("The deadline on the page has already passed. It may be from an earlier cycle.");
  return { page, values, evidence, flags, providerRequestId };
}

async function extract(ctx) {
  const row = await owned(ctx);
  if (!EDITABLE.includes(row.status)) fail(409, "This submission is with reviewers now.");
  const input = parseWith(z.object(confirmation), await ctx.body(1024));
  const result = await extractFromSource(ctx, row.url, input.requestId);
  await ctx.db.query(
    `update submissions set extracted = $3::jsonb, evidence = $4::jsonb, source_title = $5, fetched_at = now(),
       type = coalesce(type, $6), title = coalesce(title, $7), updated_at = now() where id = $1 and user_id = $2`,
    [
      row.id, ctx.user.id, JSON.stringify({ ...result.values, flags: result.flags }), JSON.stringify(result.evidence),
      result.page.title || null, result.values.type ?? null, result.values.title ?? null,
    ],
  );
  return { submission: submissionJson(await owned(ctx)), flags: result.flags, providerRequestId: result.providerRequestId };
}

async function submit(ctx) {
  const row = await owned(ctx);
  if (!EDITABLE.includes(row.status)) fail(409, "This submission was already sent for review.");
  if (!row.type && !row.extracted?.type) fail(400, "Choose the opportunity type before sending it for review.");
  if (!row.title && !row.extracted?.title) fail(400, "Add the opportunity's name before sending it for review.");
  await ctx.db.query("update submissions set status = 'pending', updated_at = now() where id = $1", [row.id]);
  await ctx.db.query("insert into audit_events (actor_id, action, target_type, target_id) values ($1, 'submission.submitted', 'submission', $2)", [ctx.user.id, row.id]);
  return submissionJson(await owned(ctx));
}

async function remove(ctx) {
  const row = await owned(ctx);
  if (row.status === "pending" || row.status === "approved") fail(409, "This submission is with reviewers or already approved, so it can't be deleted.");
  await ctx.db.query("delete from submissions where id = $1 and user_id = $2", [row.id, ctx.user.id]);
  return { deleted: true };
}

export const BADGES = [
  { id: "first", label: "First find", description: "Your first approved opportunity.", needs: (s) => s.approved >= 1 },
  { id: "five", label: "Scout", description: "Five approved opportunities.", needs: (s) => s.approved >= 5 },
  { id: "ten", label: "Trailblazer", description: "Ten approved opportunities.", needs: (s) => s.approved >= 10 },
  { id: "fact", label: "Fact checker", description: "An approved correction to a listing.", needs: (s) => s.corrections >= 1 },
];

async function rewards(ctx) {
  const [stats] = await ctx.db.query(
    `select coalesce((select sum(points) from reward_transactions where user_id = $1), 0)::int as points,
            (select count(*)::int from submissions where user_id = $1 and status = 'approved' and correction_of is null) as approved,
            (select count(*)::int from submissions where user_id = $1 and status = 'approved' and correction_of is not null) as corrections,
            (select count(*)::int from submissions where user_id = $1 and status = 'pending') as pending`,
    [ctx.user.id],
  );
  const history = await ctx.db.query(
    "select id, kind, points, reason, created_at from reward_transactions where user_id = $1 order by created_at desc limit 50",
    [ctx.user.id],
  );
  return {
    points: stats.points,
    approved: stats.approved,
    corrections: stats.corrections,
    pending: stats.pending,
    history: history.map((h) => ({ id: h.id, kind: h.kind, points: h.points, reason: h.reason, createdAt: iso(h.created_at) })),
    badges: BADGES.map((b) => ({ id: b.id, label: b.label, description: b.description, earned: b.needs(stats) })),
  };
}

export default [
  { method: "GET", path: "/api/submissions", access: "app", handler: list },
  { method: "POST", path: "/api/submissions", access: "app", handler: create },
  { method: "PATCH", path: "/api/submissions/:id", access: "app", handler: patch },
  { method: "DELETE", path: "/api/submissions/:id", access: "app", handler: remove },
  { method: "POST", path: "/api/submissions/:id/extract", access: "app", handler: extract },
  { method: "POST", path: "/api/submissions/:id/submit", access: "app", handler: submit },
  { method: "GET", path: "/api/rewards", access: "app", handler: rewards },
];
