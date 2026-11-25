// Zod schemas for everything sent to and returned by AI. Output schemas trim overlong text instead of failing
// (a failed parse still costs the student), but they always drop executable content, unknown record IDs
// and any excerpt that does not really appear in the source.
import { z } from "zod";
import { ACTIVITY_CATEGORIES, FORMATS, HONOR_LEVELS, INTERESTS, OPPORTUNITY_TYPES, ids } from "../../shared/taxonomy.mjs";
import { excerptIn } from "../../shared/text.mjs";

const CREDENTIAL = /(?:pat_|pk_|pbt_|sb_secret_)[A-Za-z0-9_-]{8,}/;
const EXECUTABLE = /<\s*(script|iframe|object|embed|style|link|meta)\b|javascript:|data:text\/html|\bon[a-z]+\s*=/i;

/** Student-provided text bound for AI: no credentials. */
export const input = (max) =>
  z.string().trim().max(max).refine((s) => !CREDENTIAL.test(s), "Remove keys or passwords before sending this to AI.");

const out = (max) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max))
    .refine((s) => !EXECUTABLE.test(s), "Unsupported content");
// .optional() first: Zod 4 only treats a missing key as optional when the schema says so.
const maybe = (max) =>
  z.union([out(max), z.null()]).optional().transform((v) => (v ? v : null));
const list = (schema, max) =>
  z.array(schema).nullable().optional().transform((v) => (v || []).filter((x) => x !== null && x !== "").slice(0, max));
const num = (min, max) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  ).catch(null);

const INTEREST_IDS = ids(INTERESTS);

export const confirmation = {
  requestId: z.uuid({ message: "Refresh the page and try again." }),
  confirmed: z.literal(true, { message: "Confirm the AI request before sending it." }),
};

// ---------- resume ----------
export const resumeInput = z.object({ text: input(14_000).refine((s) => s.length >= 40, "Add a little more text from your resume first."), ...confirmation });

export function resumeOutput(source) {
  const item = z.object({
    kind: z.enum(["activity", "honor"]).catch("activity"),
    category: z.any().optional().transform((v) => (ACTIVITY_CATEGORIES.includes(v) ? v : null)),
    title: out(100),
    role: maybe(50),
    organization: maybe(100),
    description: maybe(150),
    grades: list(z.coerce.number().int(), 4).transform((a) => [...new Set(a.filter((g) => g >= 9 && g <= 12))].sort((a, b) => a - b)),
    hoursPerWeek: num(0, 80),
    weeksPerYear: num(0, 52),
    recognition: z.any().optional().transform((v) => (ids(HONOR_LEVELS).includes(v) ? v : null)),
    evidence: maybe(300),
  });
  return z.object({
    activities: list(item.nullable().catch(null), 30).transform((items) =>
      items.filter((a) => a && a.title && a.evidence && excerptIn(source, a.evidence)).slice(0, 20),
    ),
    skills: list(out(60), 20),
    suggestedInterests: list(z.string(), 8).transform((a) => [...new Set(a.filter((id) => INTEREST_IDS.includes(id) && id !== "exploring"))].slice(0, 5)),
    gradeGuess: num(9, 12).transform((g) => (Number.isInteger(g) ? g : null)),
    summary: maybe(400),
    warnings: list(out(200), 5),
  });
}

// ---------- onboarding ----------
export const onboardingInput = z.object({
  useAi: z.boolean().default(false),
  requestId: z.uuid().optional(),
  confirmed: z.boolean().optional(),
});

export function onboardingOutput(candidateIds) {
  return z.object({
    summary: maybe(500),
    strengths: list(out(80), 5),
    picks: list(z.object({ opportunityId: z.string(), reason: out(200) }).nullable().catch(null), 10).transform((picks) => {
      const seen = new Set();
      return picks.filter((p) => p && candidateIds.includes(p.opportunityId) && !seen.has(p.opportunityId) && seen.add(p.opportunityId)).slice(0, 6);
    }),
    nextSteps: list(out(160), 3),
  });
}

// ---------- advisor ----------
export const ADVISOR_TASKS = [
  "Build a realistic plan",
  "Compare my choices",
  "Break down a project",
  "Review a draft",
  "Brainstorm activities",
  "Make an application checklist",
  "Ask anything",
];

export const advisorInput = z.object({
  threadId: z.uuid().optional().nullable(),
  task: z.enum(ADVISOR_TASKS),
  message: input(4000).refine((s) => s.length > 0, "Write your question first."),
  include: z.object({ profile: z.boolean().default(true), experience: z.boolean().default(false) }).default({ profile: true, experience: false }),
  opportunityIds: z.array(z.uuid()).max(6).default([]),
  collegeIds: z.array(z.number().int().positive()).max(6).default([]),
  tier: z.enum(["fast", "balanced", "smart"]).default("balanced"),
  ...confirmation,
});

export function advisorOutput({ opportunityIds = [], collegeIds = [], sourceIds = [] }) {
  return z
    .object({
      summary: out(2500),
      recommendations: list(
        z
          .object({
            title: out(150),
            reason: out(1000),
            estimatedMinutes: num(0, 600).transform((n) => (Number.isFinite(n) ? Math.round(n) : null)),
            opportunityId: z.any().optional().transform((v) => (opportunityIds.includes(v) ? v : null)),
            collegeId: z.any().optional().transform((v) => (collegeIds.includes(Number(v)) ? Number(v) : null)),
            sourceIds: list(z.any(), 6).transform((a) => a.map(String).filter((id) => sourceIds.includes(id))),
            uncertainties: list(out(500), 4),
          })
          .nullable()
          .catch(null),
        5,
      ).transform((a) => a.filter((r) => r && r.title).slice(0, 3)),
      followUpQuestion: maybe(500),
      warnings: list(out(500), 5),
    })
    .refine((v) => v.summary.length > 0, "Empty answer");
}

// ---------- activity tightening ----------
export const tightenInput = z.object(confirmation);
export const tightenOutput = z.object({
  options: list(out(400), 5).transform((a) => [...new Set(a)].filter((s) => s.length > 0 && s.length <= 150).slice(0, 3)),
}).refine((v) => v.options.length > 0, "No usable options");

// ---------- opportunity extraction (contributions and source re-checks) ----------
const TYPE_IDS = ids(OPPORTUNITY_TYPES);
const FORMAT_IDS = ids(FORMATS);

export function extractionOutput(source) {
  const field = (valueSchema) =>
    z
      .union([z.object({ value: z.any(), evidence: z.any() }), z.null(), z.undefined()])
      .transform((f) => {
        if (!f || f.value === null || f.value === undefined || f.value === "") return null;
        const evidence = typeof f.evidence === "string" ? f.evidence.replace(/\s+/g, " ").trim().slice(0, 400) : "";
        if (!excerptIn(source, evidence)) return null;
        const parsed = valueSchema.safeParse(f.value);
        return parsed.success && parsed.data !== null && !(Array.isArray(parsed.data) && !parsed.data.length) ? { value: parsed.data, evidence } : null;
      });
  return z.object({
    fields: z
      .object({
        title: field(out(180)),
        provider: field(out(180)),
        type: field(z.string().refine((v) => TYPE_IDS.includes(v))),
        summary: field(out(600)),
        eligibility: field(out(400)),
        grades: field(list(z.coerce.number().int(), 4).transform((a) => [...new Set(a.filter((g) => g >= 9 && g <= 12))].sort((a, b) => a - b))),
        interests: field(list(z.string(), 6).transform((a) => [...new Set(a.filter((i) => INTEREST_IDS.includes(i)))])),
        format: field(z.string().refine((v) => FORMAT_IDS.includes(v))),
        location: field(out(120)),
        cost: field(z.string().refine((v) => ["free", "paid", "varies"].includes(v))),
        deadline: field(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)))),
        deadlineNote: field(out(200)),
        timeCommitment: field(out(160)),
      })
      .partial()
      .default({}),
    flags: list(out(200), 6),
  });
}
