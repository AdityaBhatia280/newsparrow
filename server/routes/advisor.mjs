// The AI Advisor: threaded conversations grounded in the student's confirmed profile and verified records.
import { BY_ID, PROGRAM_LABELS } from "../../shared/taxonomy.mjs";
import { callModel } from "../ai/client.mjs";
import { ADVISOR } from "../ai/prompts.mjs";
import { advisorInput, advisorOutput } from "../ai/schemas.mjs";
import { pgArray } from "../db/index.mjs";
import { fail, parseWith } from "../http.mjs";
import { COLLEGE_FIELDS, OPPORTUNITY_FIELDS, iso, loadProfile, promptProfile, topPrograms } from "../models.mjs";

const threadJson = (r) => ({ id: r.id, task: r.task, title: r.title, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const messageJson = (r) => ({ id: r.id, role: r.role, content: r.content, tier: r.tier, providerRequestId: r.provider_request_id, createdAt: iso(r.created_at) });

async function threads(ctx) {
  const rows = await ctx.db.query("select * from advisor_threads where user_id = $1 order by updated_at desc limit 50", [ctx.user.id]);
  return { items: rows.map(threadJson) };
}

async function thread(ctx) {
  const [row] = await ctx.db.query("select * from advisor_threads where id = $1 and user_id = $2", [ctx.params.id, ctx.user.id]);
  if (!row) fail(404, "That conversation isn't in your advisor history.");
  const messages = await ctx.db.query("select * from advisor_messages where thread_id = $1 order by created_at", [row.id]);
  return { thread: threadJson(row), messages: messages.map(messageJson) };
}

async function removeThread(ctx) {
  const rows = await ctx.db.query("delete from advisor_threads where id = $1 and user_id = $2 returning id", [ctx.params.id, ctx.user.id]);
  if (!rows.length) fail(404, "That conversation isn't in your advisor history.");
  return { deleted: true };
}

const percent = (v) => (Number.isFinite(v) ? Math.round(v * 100) + "%" : null);
const money = (v) => (Number.isFinite(v) ? "$" + v.toLocaleString("en-US") : null);

async function records(db, opportunityIds, collegeIds) {
  const [opportunities, colleges] = await Promise.all([
    opportunityIds.length
      ? db.query(`select ${OPPORTUNITY_FIELDS} from opportunities o where o.id = any($1::uuid[]) and o.status = 'approved'`, [pgArray(opportunityIds)])
      : [],
    collegeIds.length ? db.query(`select ${COLLEGE_FIELDS} from colleges c where c.id = any($1::int[])`, [pgArray(collegeIds)]) : [],
  ]);
  return [
    ...opportunities.map((o) => ({
      id: o.id,
      kind: "opportunity",
      name: o.title,
      provider: o.provider,
      type: BY_ID.type[o.type]?.label ?? o.type,
      format: BY_ID.format[o.format]?.label ?? o.format,
      location: o.location,
      grades: o.grades,
      summary: o.summary,
      officialSite: o.official_url,
      verified: !!o.facts_verified_at,
      ...(o.facts_verified_at
        ? { verifiedOn: iso(o.facts_verified_at).slice(0, 10), cost: o.cost, deadline: o.deadline, eligibility: o.eligibility, timeCommitment: o.time_commitment }
        : { note: "Dates, costs and eligibility are not verified yet; they must be checked on the official site." }),
    })),
    ...colleges.map((c) => ({
      id: "college:" + c.id,
      collegeId: c.id,
      kind: "college",
      name: c.name,
      location: [c.city, c.state].filter(Boolean).join(", "),
      control: c.ownership === 1 ? "Public" : c.ownership === 2 ? "Private nonprofit" : null,
      undergraduates: c.size,
      publishedAdmissionRate: percent(c.admission_rate),
      averageNetPricePerYear: money(c.net_price),
      tuitionInState: money(c.tuition_in),
      tuitionOutOfState: money(c.tuition_out),
      finishWithinSixYears: percent(c.completion_rate),
      biggestPrograms: topPrograms(c.program_shares, 5).map((p) => `${PROGRAM_LABELS[p.key]} (${Math.round(p.share * 100)}% of degrees)`),
      source: `U.S. Department of Education College Scorecard, retrieved ${c.source_retrieved_at}`,
      officialSite: c.url,
      verified: true,
    })),
  ];
}

async function send(ctx) {
  const input = parseWith(advisorInput, await ctx.body(20_000));
  let current = null;
  if (input.threadId) {
    [current] = await ctx.db.query("select * from advisor_threads where id = $1 and user_id = $2", [input.threadId, ctx.user.id]);
    if (!current) fail(404, "That conversation isn't in your advisor history.");
  }
  const profileRow = await loadProfile(ctx.db, ctx.user.id);
  let experience;
  if (input.include.experience) {
    const acts = await ctx.db.query("select kind, title, role, organization, description from activities where user_id = $1 order by kind, position limit 15", [ctx.user.id]);
    experience = acts.map((a) => [a.kind === "honor" ? "Honor" : "Activity", a.title, a.role, a.organization, a.description].filter(Boolean).join(" · "));
  }
  const context = await records(ctx.db, input.opportunityIds, input.collegeIds);
  const history = current
    ? (await ctx.db.query("select role, content from advisor_messages where thread_id = $1 order by created_at desc limit 6", [current.id]))
        .reverse()
        .map((m) => ({ role: m.role, text: m.role === "user" ? m.content.text : m.content.summary }))
    : [];
  const oppIds = context.filter((r) => r.kind === "opportunity").map((r) => r.id);
  const colIds = context.filter((r) => r.kind === "college").map((r) => r.collegeId);
  const { data, providerRequestId } = await callModel(ctx, {
    kind: "advisor",
    requestId: input.requestId,
    tier: input.tier,
    system: ADVISOR,
    user: {
      task: input.task,
      question: input.message,
      profile: input.include.profile ? promptProfile(profileRow, { experience: input.include.experience }) : null,
      activities: experience,
      conversation: history,
      records: context,
    },
    schema: advisorOutput({ opportunityIds: oppIds, collegeIds: colIds, sourceIds: context.map((r) => r.id) }),
    maxTokens: input.tier === "smart" ? 2400 : 1600,
    temperature: 0.4,
  });
  return ctx.db.tx(async (t) => {
    if (!current) {
      const title = input.message.replace(/\s+/g, " ").slice(0, 70) + (input.message.length > 70 ? "…" : "");
      [current] = await t.query("insert into advisor_threads (user_id, task, title) values ($1, $2, $3) returning *", [ctx.user.id, input.task, title]);
    } else {
      [current] = await t.query("update advisor_threads set updated_at = now() where id = $1 returning *", [current.id]);
    }
    const userContent = {
      text: input.message,
      task: input.task,
      context: { profile: input.include.profile, experience: input.include.experience, opportunityIds: oppIds, collegeIds: colIds },
    };
    const [question] = await t.query(
      "insert into advisor_messages (thread_id, user_id, role, content, tier) values ($1, $2, 'user', $3::jsonb, $4) returning *",
      [current.id, ctx.user.id, JSON.stringify(userContent), input.tier],
    );
    const [answer] = await t.query(
      "insert into advisor_messages (thread_id, user_id, role, content, tier, provider_request_id) values ($1, $2, 'assistant', $3::jsonb, $4, $5) returning *",
      [current.id, ctx.user.id, JSON.stringify(data), input.tier, providerRequestId],
    );
    return { thread: threadJson(current), messages: [messageJson(question), messageJson(answer)] };
  });
}

export default [
  { method: "GET", path: "/api/advisor/threads", access: "app", handler: threads },
  { method: "GET", path: "/api/advisor/threads/:id", access: "app", handler: thread },
  { method: "DELETE", path: "/api/advisor/threads/:id", access: "app", handler: removeThread },
  { method: "POST", path: "/api/advisor", access: "app", handler: send },
];
