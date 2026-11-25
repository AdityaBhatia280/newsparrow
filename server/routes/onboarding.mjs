// Resume analysis and the personalized starting plan shown in the run-through.
import { BY_ID } from "../../shared/taxonomy.mjs";
import { redactContact } from "../../shared/text.mjs";
import { callModel } from "../ai/client.mjs";
import { ONBOARDING, RESUME } from "../ai/prompts.mjs";
import { onboardingInput, onboardingOutput, resumeInput, resumeOutput } from "../ai/schemas.mjs";
import { pgArray } from "../db/index.mjs";
import { HttpError, fail, parseWith } from "../http.mjs";
import { matchProfile } from "../match.mjs";
import { OPPORTUNITY_FIELDS, loadProfile, opportunityCard, promptProfile } from "../models.mjs";
import { addRoadmapTasks, currentTerm, suggestColleges } from "../plan.mjs";

async function analyzeResume(ctx) {
  const input = parseWith(resumeInput, await ctx.body(60_000));
  const text = redactContact(input.text).slice(0, 14_000); // defense in depth: the browser redacts first
  const { data, providerRequestId } = await callModel(ctx, {
    kind: "resume",
    requestId: input.requestId,
    tier: "balanced",
    system: RESUME,
    user: { resumeText: text },
    schema: resumeOutput(text),
    maxTokens: 3000,
    temperature: 0.1,
  });
  return { ...data, providerRequestId };
}

function fallbackSummary(p) {
  const interests = (p.interests || []).filter((i) => i !== "exploring").map((i) => BY_ID.interest[i]?.label.toLowerCase()).filter(Boolean);
  const lead = p.grade ? `You're in grade ${p.grade}` : "You're getting started";
  const what = interests.length ? ` and interested in ${interests.slice(0, 2).join(" and ")}` : "";
  return `${lead}${what}. Sparrow picked opportunities and colleges to explore based on what you told us, and you can change any of it later.`;
}

async function complete(ctx) {
  const input = parseWith(onboardingInput, await ctx.body(2048));
  const row = await loadProfile(ctx.db, ctx.user.id);
  if (!row.grade) fail(400, "Choose your grade first.");
  const profile = matchProfile(row);
  const opportunities = await ctx.db.query(
    `select ${OPPORTUNITY_FIELDS}, s.id as saved_id, s.status as saved_status from opportunities o
       left join saved_items s on s.opportunity_id = o.id and s.user_id = $1
      where o.status = 'approved'`,
    [ctx.user.id],
  );
  const ranked = opportunities
    .map((r) => opportunityCard(r, profile))
    .filter((c) => c.match.eligible)
    .sort((a, b) => b.match.score - a.match.score);
  const candidates = ranked.slice(0, 20);
  let picks = candidates.slice(0, 6).map((c) => ({ ...c, reason: c.match.reasons[0] ?? null }));
  const colleges = await suggestColleges(ctx.db, ctx.user.id, profile, 6);
  const tasks = await addRoadmapTasks(ctx.db, ctx.user.id, row.grade, currentTerm(ctx.services.now()));

  let ai = null, aiError = null;
  if (input.useAi) {
    if (!input.confirmed || !input.requestId) fail(400, "Confirm the AI request before sending it.");
    const activities = await ctx.db.query(
      "select kind, title, role, organization, description from activities where user_id = $1 order by kind, position limit 15",
      [ctx.user.id],
    );
    try {
      ({ data: ai } = await callModel(ctx, {
        kind: "onboarding",
        requestId: input.requestId,
        tier: "balanced",
        system: ONBOARDING,
        user: {
          profile: promptProfile(row, { experience: true }),
          activities,
          candidates: candidates.map((c) => ({ id: c.id, name: c.title, provider: c.provider, type: c.type, interests: c.interests, grades: c.grades, format: c.format })),
        },
        schema: onboardingOutput(candidates.map((c) => c.id)),
        maxTokens: 1500,
        temperature: 0.4,
      }));
      if (ai.picks.length) {
        const byId = new Map(candidates.map((c) => [c.id, c]));
        const chosen = ai.picks.map((p) => ({ ...byId.get(p.opportunityId), reason: p.reason }));
        const rest = picks.filter((p) => !ai.picks.some((x) => x.opportunityId === p.id));
        picks = [...chosen, ...rest].slice(0, 6);
      }
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      aiError = { status: error.status, message: error.message, topUpUrl: error.extra?.topUpUrl ?? null };
    }
  }
  const summary = ai?.summary || row.summary || fallbackSummary(row);
  const strengths = ai?.strengths?.length ? ai.strengths : row.strengths || [];
  await ctx.db.query(
    `update profiles set onboarded_at = coalesce(onboarded_at, now()), summary = $2,
       strengths = case when cardinality($3::text[]) > 0 then $3::text[] else strengths end, updated_at = now()
     where user_id = $1`,
    [ctx.user.id, summary, pgArray(strengths)],
  );
  return { summary, strengths, nextSteps: ai?.nextSteps ?? [], opportunities: picks, colleges, tasks, usedAi: !!ai, aiError };
}

export default [
  { method: "POST", path: "/api/resume/analyze", access: "app", handler: analyzeResume, limit: 60_000 },
  { method: "POST", path: "/api/onboarding/complete", access: "app", handler: complete },
];
