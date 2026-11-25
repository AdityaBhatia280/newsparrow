// Row → JSON mappers shared by routes, so every endpoint returns the same shapes.
import { BY_ID, PROGRAM_LABELS, stateName } from "../shared/taxonomy.mjs";
import { redactContact } from "../shared/text.mjs";
import { matchProfile, scoreCollege, scoreOpportunity } from "./match.mjs";

const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

export const OPPORTUNITY_FIELDS = `o.id, o.slug, o.title, o.provider, o.type, o.interests, o.grades, o.format, o.location, o.cost,
  o.summary, o.official_url, o.eligibility, o.time_commitment, o.deadline::text as deadline, o.deadline_note,
  o.status, o.facts_verified_at, o.link_checked_at, o.updated_at`;

export function opportunityCard(row, profile) {
  const card = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    provider: row.provider,
    type: row.type,
    interests: row.interests || [],
    grades: row.grades || [],
    format: row.format,
    location: row.location,
    cost: row.cost,
    summary: row.summary,
    deadline: row.deadline,
    deadlineNote: row.deadline_note,
    officialUrl: row.official_url,
    status: row.status,
    factsVerifiedAt: iso(row.facts_verified_at),
    linkCheckedAt: iso(row.link_checked_at),
    saved: row.saved_id ? { id: row.saved_id, status: row.saved_status } : null,
  };
  if (profile) card.match = scoreOpportunity(card, profile);
  return card;
}

export function opportunityDetail(row, profile) {
  return { ...opportunityCard(row, profile), eligibility: row.eligibility, timeCommitment: row.time_commitment, updatedAt: iso(row.updated_at) };
}

export const COLLEGE_FIELDS = `c.id, c.name, c.city, c.state, c.url, c.price_calculator_url, c.ownership, c.locale, c.size,
  c.admission_rate, c.tuition_in, c.tuition_out, c.net_price, c.completion_rate, c.median_earnings, c.program_shares,
  c.source_retrieved_at::text as source_retrieved_at`;

export function topPrograms(shares, count = 3) {
  return Object.entries(shares || {})
    .filter(([key, v]) => PROGRAM_LABELS[key] && Number(v) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, share]) => ({ key, label: PROGRAM_LABELS[key], share: Math.round(share * 1000) / 1000 }));
}

export function collegeCard(row, profile) {
  const card = {
    id: row.id,
    name: row.name,
    city: row.city,
    state: row.state,
    url: row.url,
    ownership: row.ownership,
    size: row.size,
    admissionRate: row.admission_rate,
    netPrice: row.net_price,
    completionRate: row.completion_rate,
    topPrograms: topPrograms(row.program_shares),
    shortlist: row.tag ? { tag: row.tag, note: row.note ?? "" } : null,
  };
  if (profile) card.match = scoreCollege(row, profile);
  return card;
}

export function collegeDetail(row, profile) {
  return {
    ...collegeCard(row, profile),
    locale: row.locale,
    tuitionIn: row.tuition_in,
    tuitionOut: row.tuition_out,
    medianEarnings: row.median_earnings,
    priceCalculatorUrl: row.price_calculator_url,
    programs: topPrograms(row.program_shares, 10),
    scorecardUrl: `https://collegescorecard.ed.gov/school/?${row.id}`,
    sourceRetrievedAt: row.source_retrieved_at,
  };
}

export function taskJson(row) {
  return {
    id: row.id,
    title: row.title,
    due: row.due,
    done: !!row.done_at,
    doneAt: iso(row.done_at),
    savedId: row.saved_id,
    savedTitle: row.saved_title ?? null,
    source: row.source,
    planKey: row.plan_key,
    createdAt: iso(row.created_at),
  };
}

export const PROFILE_FIELDS = `first_name, grade, country, region, persona, interests, custom_interest, goals, weekly_hours,
  budget, format, study_location, experience, skills, summary, strengths, onboarding_step, onboarded_at, tour_done_at, settings`;

export function profileJson(row = {}) {
  return {
    firstName: row.first_name ?? null,
    grade: row.grade ?? null,
    region: row.region ?? null,
    persona: row.persona ?? null,
    interests: row.interests || [],
    customInterest: row.custom_interest ?? null,
    goals: row.goals || [],
    weeklyHours: row.weekly_hours ?? null,
    budget: row.budget ?? null,
    format: row.format ?? null,
    studyLocation: row.study_location ?? null,
    experience: row.experience ?? null,
    skills: row.skills || [],
    summary: row.summary ?? null,
    strengths: row.strengths || [],
    onboardingStep: row.onboarding_step ?? 0,
    onboarded: !!row.onboarded_at,
    tourDone: !!row.tour_done_at,
    settings: row.settings || {},
  };
}

export async function loadProfile(db, userId) {
  const rows = await db.query(`select ${PROFILE_FIELDS} from profiles where user_id = $1`, [userId]);
  return rows[0] || {};
}

export async function loadMatchProfile(db, userId) {
  return matchProfile(await loadProfile(db, userId));
}

export function activityJson(row) {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    role: row.role,
    organization: row.organization,
    description: row.description,
    grades: row.grades || [],
    hoursPerWeek: row.hours_per_week,
    weeksPerYear: row.weeks_per_year,
    recognition: row.recognition,
    source: row.source,
    position: row.position,
  };
}

export function submissionJson(row) {
  return {
    id: row.id,
    url: row.url,
    type: row.type,
    title: row.title,
    notes: row.notes,
    status: row.status,
    extracted: row.extracted || null,
    evidence: row.evidence || [],
    sourceTitle: row.source_title,
    fetchedAt: iso(row.fetched_at),
    decisionReason: row.decision_reason,
    decidedAt: iso(row.decided_at),
    opportunitySlug: row.opportunity_slug ?? null,
    correctionOf: row.correction_of ? { id: row.correction_of, slug: row.correction_slug ?? null, title: row.correction_title ?? null } : null,
    submitter: row.submitter_name ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** The profile fields sent to AI. Never the student's name, email or account ID. */
export function promptProfile(row = {}, { experience = false } = {}) {
  const label = (table, id) => (id ? BY_ID[table][id]?.label ?? null : null);
  return {
    grade: row.grade ?? null,
    state: row.region && row.region !== "INTL" ? stateName(row.region) : row.region === "INTL" ? "Outside the U.S." : null,
    stage: row.persona ? BY_ID.persona[row.persona]?.description ?? null : null,
    interests: [...(row.interests || []).map((i) => BY_ID.interest[i]?.label).filter(Boolean), ...(row.custom_interest ? [row.custom_interest] : [])],
    goals: (row.goals || []).map((g) => BY_ID.goal[g]?.label).filter(Boolean),
    weeklyHours: row.weekly_hours ?? null,
    activityBudget: label("budget", row.budget),
    formatPreference: label("formatPref", row.format),
    collegeLocation: label("studyLocation", row.study_location),
    skills: (row.skills || []).slice(0, 12),
    ...(experience && row.experience ? { experience: redactContact(row.experience).slice(0, 1500) } : {}),
  };
}

export { iso };
