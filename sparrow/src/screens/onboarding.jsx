// The quick survey: seven short steps, autosaved, then Sparrow builds a starting plan.
import { useEffect, useState } from "preact/hooks";
import { BUDGETS, FORMAT_PREFS, GOALS, INTERESTS, PERSONAS, STATES, STUDY_LOCATIONS } from "../../../shared/taxonomy.mjs";
import { api, uuid } from "../lib/api.js";
import { label, regionLabel } from "../lib/format.js";
import { useTitle } from "../lib/hooks.js";
import { navigate } from "../lib/router.js";
import { refreshSession } from "../lib/store.js";
import { AiConsent, AiError } from "../ui/ai.jsx";
import { Icon, Mark } from "../ui/icons.jsx";
import { Button, ChipGroup, Display, Field, Glass, Notice, SelectField, Tag, TextField } from "../ui/kit.jsx";
import { Splash } from "./entry.jsx";
import { ResumeImport } from "./resume.jsx";
import { RunThrough } from "./runthrough.jsx";

const STEPS = [
  { id: "basics", kicker: "Let's start", pre: "Hi! What should we", accent: "call", post: "you?" },
  { id: "stage", kicker: "Where you are", pre: "Which sounds", accent: "most", post: "like you?" },
  { id: "interests", kicker: "Your interests", pre: "What are you", accent: "into", post: "?" },
  { id: "goals", kicker: "Your goals", pre: "What do you want", accent: "next", post: "?" },
  { id: "time", kicker: "Your time & budget", pre: "How much room", accent: "do", post: "you have?" },
  { id: "resume", kicker: "Your experience", pre: "Got a", accent: "resume", post: "?" },
  { id: "build", kicker: "Almost there", pre: "Ready to build", accent: "your", post: "plan?" },
];

const PERSONA_ICONS = { exploring: "compass", building: "rocket", applying: "graduation-cap" };

export function Onboarding() {
  useTitle("Get started");
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState({});
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/profile").then((p) => {
      setProfile(p);
      setDraft(p);
      setStep(Math.min(p.onboardingStep || 0, STEPS.length - 1));
    });
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector(".wizard h1")?.focus({ preventScroll: true });
  }, [step, !!result]);

  if (result)
    return (
      <RunThrough
        data={result}
        onFinish={async () => {
          navigate("/app", { replace: true });
          await refreshSession();
        }}
      />
    );
  if (!profile) return <Splash />;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const s = STEPS[step];

  const validate = () => {
    if (s.id === "basics") {
      if (!draft.firstName?.trim()) return "Add the name you'd like Sparrow to use.";
      if (!draft.grade) return "Choose your grade.";
      if (!draft.region) return "Choose your state, or Outside the U.S.";
    }
    if (s.id === "stage" && !draft.persona) return "Pick the one that fits best. You can change it later.";
    if (s.id === "interests" && !draft.interests?.length && !draft.customInterest?.trim()) return "Pick at least one, or choose Still exploring.";
    return "";
  };

  const fields = {
    basics: ["firstName", "grade", "region"],
    stage: ["persona"],
    interests: ["interests", "customInterest"],
    goals: ["goals"],
    time: ["weeklyHours", "budget", "format", "studyLocation"],
  };

  const next = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setError("");
    setSaving(true);
    try {
      const patch = Object.fromEntries((fields[s.id] || []).map((k) => [k, draft[k] ?? null]));
      if (patch.interests === null) patch.interests = [];
      if (patch.goals === null) patch.goals = [];
      if (s.id === "time" && patch.weeklyHours === null) patch.weeklyHours = 5;
      const p = await api.patch("/api/profile", { ...patch, onboardingStep: step + 1 });
      setProfile(p);
      setStep(step + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const back = () => {
    setError("");
    setStep(Math.max(0, step - 1));
  };

  return (
    <div class="wizard">
      <header class="wizard__bar">
        <span class="brand">
          <Mark />
          <span>sparrow</span>
        </span>
        <div class="wizard__progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          <span class="small muted">
            Step {step + 1} of {STEPS.length}
          </span>
          <div class="progress">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      </header>
      <main id="main" class="wizard__main" tabIndex={-1}>
        <div class="wizard__q reveal" key={"q" + step}>
          <p class="kicker">{s.kicker}</p>
          <Display pre={s.pre} accent={s.accent} post={s.post} size="md" />
        </div>
        <div class="wizard__body reveal" key={"b" + step} style={{ animationDelay: "0.06s" }}>
          {s.id === "basics" && (
            <Glass pad="lg" class="stack stack--lg">
              <TextField label="First name" value={draft.firstName} onInput={(v) => set({ firstName: v })} autoComplete="given-name" max={50} required />
              <Field label="Grade">
                <ChipGroup multiple={false} label="Grade" value={draft.grade} onChange={(g) => set({ grade: g })} options={[9, 10, 11, 12].map((g) => ({ id: g, label: `Grade ${g}` }))} />
              </Field>
              <SelectField
                label="State"
                value={draft.region}
                onChange={(v) => set({ region: v })}
                placeholder="Choose your state"
                options={[...STATES.map(([id, name]) => ({ id, label: name })), { id: "INTL", label: "Outside the U.S." }]}
              />
            </Glass>
          )}
          {s.id === "stage" && (
            <div class="persona-grid" role="group" aria-label="Which sounds most like you">
              {PERSONAS.map((p) => (
                <button key={p.id} type="button" class="persona glass glass--interactive" aria-pressed={String(draft.persona === p.id)} onClick={() => set({ persona: p.id })}>
                  <span class="tile tile--lg" aria-hidden="true">
                    <Icon name={PERSONA_ICONS[p.id]} />
                  </span>
                  <strong>{p.label}</strong>
                  <span class="muted">{p.description}</span>
                </button>
              ))}
            </div>
          )}
          {s.id === "interests" && (
            <Glass pad="lg" class="stack stack--lg">
              <ChipGroup label="Interests" options={INTERESTS} value={draft.interests || []} onChange={(v) => set({ interests: v })} />
              <TextField label="Anything else? (optional)" value={draft.customInterest} onInput={(v) => set({ customInterest: v })} max={100} placeholder="For example, marine biology or game design" />
            </Glass>
          )}
          {s.id === "goals" && (
            <Glass pad="lg" class="stack">
              <p class="muted">Pick as many as you like.</p>
              <ChipGroup label="Goals" options={GOALS} value={draft.goals || []} onChange={(v) => set({ goals: v })} />
            </Glass>
          )}
          {s.id === "time" && (
            <Glass pad="lg" class="stack stack--lg">
              <Field label={`Time for activities: about ${draft.weeklyHours ?? 5}${(draft.weeklyHours ?? 5) >= 20 ? "+" : ""} hours a week`}>
                <input
                  class="range"
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={draft.weeklyHours ?? 5}
                  onInput={(e) => set({ weeklyHours: Number(e.currentTarget.value) })}
                  aria-label="Hours a week"
                />
              </Field>
              <Field label="Budget for activities">
                <ChipGroup multiple={false} label="Budget" options={BUDGETS} value={draft.budget} onChange={(v) => set({ budget: v })} />
              </Field>
              <Field label="Online or in person?">
                <ChipGroup multiple={false} label="Format" options={FORMAT_PREFS} value={draft.format} onChange={(v) => set({ format: v })} />
              </Field>
              <Field label="Where would you like to go to college?">
                <ChipGroup multiple={false} label="College location" options={STUDY_LOCATIONS} value={draft.studyLocation} onChange={(v) => set({ studyLocation: v })} />
              </Field>
            </Glass>
          )}
          {s.id === "resume" && (
            <Glass pad="lg">
              <ResumeImport
                onDone={() => api.patch("/api/profile", { onboardingStep: step + 1 }).then(() => setStep(step + 1))}
                onSkip={() => api.patch("/api/profile", { onboardingStep: step + 1 }).then(() => setStep(step + 1))}
              />
            </Glass>
          )}
          {s.id === "build" && <BuildStep profile={profile} onBuilt={setResult} />}
          {error && (
            <p class="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer class="wizard__foot">
          {step > 0 ? (
            <Button variant="ghost" icon="arrow-left" onClick={back}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {s.id !== "resume" && s.id !== "build" && (
            <Button size="lg" iconRight="arrow-right" loading={saving} onClick={next}>
              Continue
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}

function BuildStep({ profile, onBuilt }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const build = async (useAi) => {
    setBusy(useAi ? "ai" : "plain");
    setError(null);
    try {
      const r = await api.post("/api/onboarding/complete", useAi ? { useAi: true, requestId: uuid(), confirmed: true } : { useAi: false });
      await new Promise((res) => setTimeout(res, 900)); // let the build animation land
      onBuilt(r);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  };
  if (busy) return <Building ai={busy === "ai"} />;
  const interests = (profile.interests || []).map((i) => label("interest", i));
  return (
    <div class="stack stack--lg">
      <Glass pad="lg" class="stack">
        <p class="kicker">What you told us</p>
        <div class="chips">
          {profile.grade && <Tag tone="blue">Grade {profile.grade}</Tag>}
          {profile.region && <Tag>{regionLabel(profile.region)}</Tag>}
          {profile.persona && <Tag>{label("persona", profile.persona)}</Tag>}
          {interests.map((i) => (
            <Tag key={i}>{i}</Tag>
          ))}
          {profile.customInterest && <Tag>{profile.customInterest}</Tag>}
        </div>
        <p class="muted">Sparrow matches you with real opportunities and colleges, then adds a few steps for this school year to your plan.</p>
      </Glass>
      <Glass pad="lg" class="stack">
        <h2 style={{ fontSize: "20px" }}>Make it personal with AI</h2>
        <p class="muted">AI reads your answers and activities (never your name or contact details), picks your best matches and explains why.</p>
        <AiConsent checked={consent} onChange={setConsent} what="your answers and activities" />
        <AiError error={error} />
        <div class="row">
          <Button size="lg" icon="sparkles" disabled={!consent} onClick={() => build(true)}>
            Build my plan with AI
          </Button>
          <Button size="lg" variant="ghost" onClick={() => build(false)}>
            Build without AI
          </Button>
        </div>
      </Glass>
    </div>
  );
}

function Building({ ai }) {
  const lines = [
    ["compass", "Matching extracurriculars to your interests"],
    ["graduation-cap", "Picking colleges worth a look"],
    ["list-checks", "Mapping out your school year"],
    ...(ai ? [["sparkles", "Writing your personal summary"]] : []),
  ];
  return (
    <Glass pad="lg" class="building" role="status" aria-live="polite">
      <div class="spinner-orb" aria-hidden="true" />
      <ul class="list-reset stack">
        {lines.map(([icon, text], i) => (
          <li key={text} class="building__line" style={{ animationDelay: `${0.2 + i * 0.7}s` }}>
            <Icon name={icon} />
            {text}
          </li>
        ))}
      </ul>
      <Notice icon="info">This usually takes a few seconds.</Notice>
    </Glass>
  );
}
