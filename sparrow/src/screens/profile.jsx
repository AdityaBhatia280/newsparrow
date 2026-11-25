import { useEffect, useState } from "preact/hooks";
import { ACTIVITY_CATEGORIES, BUDGETS, FORMAT_PREFS, GOALS, HONOR_LEVELS, INTERESTS, LIMITS, PERSONAS, STATES, STUDY_LOCATIONS } from "../../../shared/taxonomy.mjs";
import { api, uuid } from "../lib/api.js";
import { gradesLabel, initials, label, regionLabel } from "../lib/format.js";
import { useApi, useTitle } from "../lib/hooks.js";
import { refreshSession, session, toast, confirmAction } from "../lib/store.js";
import { AiConsent, AiError } from "../ui/ai.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, ChipGroup, Empty, Field, Glass, IconButton, PageHead, Segmented, SelectField, Sheet, Skeleton, Tag, TextField } from "../ui/kit.jsx";
import { ResumeImport } from "./resume.jsx";

export function Profile() {
  useTitle("Profile");
  const profile = useApi("/api/profile");
  const acts = useApi("/api/activities");
  const [kind, setKind] = useState("activity");
  const [editing, setEditing] = useState(null);
  const [editProfile, setEditProfile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => print(), 120);
    return () => {
      clearTimeout(t);
      removeEventListener("afterprint", done);
    };
  }, [printing]);
  if (!profile.data || !acts.data) return <Skeleton count={3} height={160} />;
  const p = profile.data;
  const all = acts.data.items;
  const list = all.filter((a) => a.kind === kind);
  const counts = { activity: all.filter((a) => a.kind === "activity").length, honor: all.filter((a) => a.kind === "honor").length };
  const move = async (item, dir) => {
    const order = list.map((a) => a.id);
    const i = order.indexOf(item.id), j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const others = all.filter((a) => a.kind !== kind).map((a) => a.id);
    try {
      const r = await api.post("/api/activities/reorder", { ids: [...order, ...others] });
      acts.setData(r);
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const remove = async (item) => {
    if (!(await confirmAction({ title: `Delete "${item.title}"?`, body: "It will be removed from your activities list.", confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await api.del(`/api/activities/${item.id}`);
      acts.reload();
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const max = kind === "activity" ? LIMITS.activities : LIMITS.honors;
  return (
    <div class="profile">
      <PageHead kicker="Profile" pre="All" accent="about" post="you" />
      <Glass strong pad="lg" class="profile__card reveal">
        <span class="avatar avatar--lg" aria-hidden="true">
          {initials(p.firstName || session.value?.user?.name)}
        </span>
        <div class="stack stack--sm" style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "28px" }}>{p.firstName || "Your profile"}</h2>
          <div class="row" style={{ gap: "8px" }}>
            {p.grade && <Tag tone="blue">Grade {p.grade}</Tag>}
            {p.region && <Tag icon="map-pin">{regionLabel(p.region)}</Tag>}
            {p.persona && <Tag>{label("persona", p.persona)}</Tag>}
          </div>
          {p.summary && <p class="muted">{p.summary}</p>}
        </div>
        <Button variant="quiet" icon="pencil" onClick={() => setEditProfile(true)}>
          Edit profile
        </Button>
      </Glass>
      <div class="profile__grid">
        <Glass pad="lg" class="stack">
          <h2 class="h-sub">Interests</h2>
          <div class="chips">
            {p.interests.map((i) => (
              <Tag key={i}>{label("interest", i)}</Tag>
            ))}
            {p.customInterest && <Tag>{p.customInterest}</Tag>}
            {!p.interests.length && !p.customInterest && <span class="muted">None yet</span>}
          </div>
          <h2 class="h-sub">Goals</h2>
          <div class="chips">
            {p.goals.map((g) => (
              <Tag key={g}>{label("goal", g)}</Tag>
            ))}
            {!p.goals.length && <span class="muted">None yet</span>}
          </div>
        </Glass>
        <Glass pad="lg" class="stack">
          <h2 class="h-sub">Strengths & skills</h2>
          <div class="chips">
            {p.strengths.map((s) => (
              <Tag key={s} tone="blue" icon="star">
                {s}
              </Tag>
            ))}
            {p.skills.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
            {!p.strengths.length && !p.skills.length && <span class="muted">Import your resume to fill these in.</span>}
          </div>
          <p class="small muted">
            Time: {p.weeklyHours != null ? `${p.weeklyHours} hrs/week` : "not set"} · Budget: {label("budget", p.budget, "not set")} · {label("formatPref", p.format, "Any format")}
          </p>
        </Glass>
      </div>

      <section class="stack">
        <div class="section-title" style={{ alignItems: "center" }}>
          <h2>Activities list</h2>
          <div class="row">
            <Button variant="ghost" size="sm" icon="upload" onClick={() => setImporting(true)}>
              Import resume
            </Button>
            <Button variant="ghost" size="sm" icon="printer" onClick={() => setPrinting(true)} disabled={!all.length}>
              Brag sheet
            </Button>
          </div>
        </div>
        <div class="row row--between">
          <Segmented
            label="List"
            value={kind}
            onChange={setKind}
            options={[
              { id: "activity", label: `Activities ${counts.activity}/${LIMITS.activities}` },
              { id: "honor", label: `Honors ${counts.honor}/${LIMITS.honors}` },
            ]}
          />
          <Button icon="plus" size="sm" disabled={list.length >= max} onClick={() => setEditing({ kind })}>
            Add {kind === "honor" ? "honor" : "activity"}
          </Button>
        </div>
        {list.length ? (
          <ol class="list-reset stack stagger">
            {list.map((a, n) => (
              <Glass as="li" key={a.id} class="activity">
                <span class="activity__num">{n + 1}</span>
                <div class="stack stack--sm activity__body">
                  <div class="row" style={{ gap: "8px" }}>
                    {a.category && <Tag>{a.category}</Tag>}
                    {a.recognition && <Tag tone="blue">{label("honor", a.recognition)}</Tag>}
                    {a.grades.length > 0 && <Tag>{gradesLabel(a.grades)}</Tag>}
                    {(a.hoursPerWeek || a.weeksPerYear) && (
                      <Tag icon="clock">
                        {a.hoursPerWeek ?? "?"} hr/wk · {a.weeksPerYear ?? "?"} wk/yr
                      </Tag>
                    )}
                  </div>
                  <h3>{a.title}</h3>
                  {(a.role || a.organization) && <p class="muted">{[a.role, a.organization].filter(Boolean).join(" · ")}</p>}
                  {a.description && (
                    <p>
                      {a.description} <span class="counter">{a.description.length}/150</span>
                    </p>
                  )}
                </div>
                <div class="activity__tools">
                  <IconButton icon="arrow-up" label="Move up" class="icon-btn--plain" disabled={n === 0} onClick={() => move(a, -1)} />
                  <IconButton icon="arrow-down" label="Move down" class="icon-btn--plain" disabled={n === list.length - 1} onClick={() => move(a, 1)} />
                  <IconButton icon="pencil" label={`Edit ${a.title}`} class="icon-btn--plain" onClick={() => setEditing(a)} />
                  <IconButton icon="trash" label={`Delete ${a.title}`} class="icon-btn--plain" onClick={() => remove(a)} />
                </div>
              </Glass>
            ))}
          </ol>
        ) : (
          <Glass>
            <Empty icon={kind === "honor" ? "medal" : "star"} title={kind === "honor" ? "No honors yet" : "No activities yet"} action={<Button icon="upload" onClick={() => setImporting(true)}>Import from resume</Button>}>
              Colleges ask for up to {LIMITS.activities} activities and {LIMITS.honors} honors. Start a list now and it'll be ready when you apply.
            </Empty>
          </Glass>
        )}
      </section>

      <ActivitySheet item={editing} onClose={() => setEditing(null)} onSaved={() => acts.reload()} />
      <ProfileSheet open={editProfile} profile={p} onClose={() => setEditProfile(false)} onSaved={(np) => profile.setData(np)} />
      <Sheet open={importing} onClose={() => setImporting(false)} title="Import from your resume" wide>
        {importing && (
          <ResumeImport
            existing={counts}
            skipLabel="Cancel"
            onSkip={() => setImporting(false)}
            onDone={({ added }) => {
              setImporting(false);
              acts.reload();
              profile.reload();
              toast(added ? `Added ${added} to your list.` : "Profile updated.", "ok");
            }}
          />
        )}
      </Sheet>
      {printing && <BragSheet profile={p} items={all} />}
    </div>
  );
}

function ActivitySheet({ item, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tighten, setTighten] = useState({ open: false, consent: false, busy: false, options: null, error: null });
  useEffect(() => {
    setF(item ? { kind: "activity", grades: [], ...item } : null);
    setError("");
    setTighten({ open: false, consent: false, busy: false, options: null, error: null });
  }, [item]);
  if (!item || !f) return <Sheet open={false} onClose={onClose} title="" />;
  const honor = f.kind === "honor";
  const set = (patch) => setF({ ...f, ...patch });
  const body = {
    category: honor ? null : f.category || null,
    title: f.title?.trim(),
    role: honor ? null : f.role?.trim() || null,
    organization: honor ? null : f.organization?.trim() || null,
    description: f.description?.trim() || null,
    grades: f.grades,
    hoursPerWeek: honor ? null : f.hoursPerWeek === "" || f.hoursPerWeek == null ? null : Number(f.hoursPerWeek),
    weeksPerYear: honor ? null : f.weeksPerYear === "" || f.weeksPerYear == null ? null : Number(f.weeksPerYear),
    recognition: honor ? f.recognition || null : null,
  };
  const save = async () => {
    if (!body.title) return setError("Give it a name.");
    setBusy(true);
    setError("");
    try {
      if (item.id) await api.patch(`/api/activities/${item.id}`, body);
      else await api.post("/api/activities", { kind: f.kind, ...body });
      onSaved();
      onClose();
      toast("Saved.", "ok");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const runTighten = async () => {
    setTighten((t) => ({ ...t, busy: true, error: null }));
    try {
      if (!item.id) throw new Error("Save it first, then tighten.");
      await api.patch(`/api/activities/${item.id}`, { description: (f.description || "").slice(0, 150) || null, role: body.role });
      const r = await api.post(`/api/activities/${item.id}/tighten`, { requestId: uuid(), confirmed: true });
      setTighten((t) => ({ ...t, busy: false, options: r.options }));
    } catch (e) {
      setTighten((t) => ({ ...t, busy: false, error: e }));
    }
  };
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={item.id ? `Edit ${honor ? "honor" : "activity"}` : `New ${honor ? "honor" : "activity"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="check" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {!honor && <SelectField label="Activity type" value={f.category} placeholder="Choose a type" options={ACTIVITY_CATEGORIES.map((c) => ({ id: c, label: c }))} onChange={(v) => set({ category: v })} />}
      <TextField label={honor ? "Honor or award" : "Activity name"} value={f.title} onInput={(v) => set({ title: v })} max={100} counter />
      {!honor && (
        <>
          <TextField label="Position or leadership" value={f.role} onInput={(v) => set({ role: v })} max={LIMITS.position} counter placeholder="e.g. Captain, Founder, Volunteer" />
          <TextField label="Organization" value={f.organization} onInput={(v) => set({ organization: v })} max={LIMITS.organization} counter />
        </>
      )}
      <TextField
        label={honor ? "Details (optional)" : "What you did"}
        multiline
        rows={3}
        value={f.description}
        onInput={(v) => set({ description: v })}
        max={LIMITS.description}
        counter
        hint="Use strong verbs and specifics. 150 characters, like the Common App."
      />
      {!honor && item.id && (
        <div class="stack stack--sm">
          {!tighten.open ? (
            <button type="button" class="link-btn" onClick={() => setTighten((t) => ({ ...t, open: true }))}>
              <Icon name="wand" size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> Tighten with AI
            </button>
          ) : (
            <Glass class="stack">
              <AiConsent compact checked={tighten.consent} onChange={(v) => setTighten((t) => ({ ...t, consent: v }))} what="this activity's name, role and description" />
              <AiError error={tighten.error} />
              <div>
                <Button size="sm" icon="wand" loading={tighten.busy} disabled={!tighten.consent || !(f.description || f.role)} onClick={runTighten}>
                  Suggest shorter versions
                </Button>
              </div>
              {tighten.options && (
                <ul class="list-reset stack stack--sm">
                  {tighten.options.map((o) => (
                    <li key={o}>
                      <button type="button" class="option" onClick={() => set({ description: o })}>
                        <span>{o}</span>
                        <span class="counter">{o.length}/150</span>
                      </button>
                    </li>
                  ))}
                  <li class="small muted">Pick one to use it, then edit it in your own words.</li>
                </ul>
              )}
            </Glass>
          )}
        </div>
      )}
      <Field label="Grades">
        <ChipGroup size="sm" label="Grades" options={[9, 10, 11, 12].map((g) => ({ id: g, label: String(g) }))} value={f.grades || []} onChange={(v) => set({ grades: v.sort((a, b) => a - b) })} />
      </Field>
      {honor ? (
        <SelectField label="Level of recognition" value={f.recognition} placeholder="Choose a level" options={HONOR_LEVELS} onChange={(v) => set({ recognition: v })} />
      ) : (
        <div class="two-col">
          <TextField label="Hours per week" type="number" min="0" max="80" value={f.hoursPerWeek ?? ""} onInput={(v) => set({ hoursPerWeek: v })} />
          <TextField label="Weeks per year" type="number" min="0" max="52" value={f.weeksPerYear ?? ""} onInput={(v) => set({ weeksPerYear: v })} />
        </div>
      )}
      {error && (
        <p class="error-text" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function ProfileSheet({ open, profile, onClose, onSaved }) {
  const [f, setF] = useState(profile);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(profile), [open]);
  const set = (patch) => setF({ ...f, ...patch });
  const save = async () => {
    setBusy(true);
    try {
      const p = await api.patch("/api/profile", {
        firstName: f.firstName || null, grade: f.grade, region: f.region, persona: f.persona, interests: f.interests, customInterest: f.customInterest || null,
        goals: f.goals, weeklyHours: f.weeklyHours, budget: f.budget, format: f.format, studyLocation: f.studyLocation,
      });
      onSaved(p);
      await refreshSession();
      onClose();
      toast("Profile saved. Your matches will update.", "ok");
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit profile"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="check" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div class="two-col">
        <TextField label="First name" value={f.firstName} onInput={(v) => set({ firstName: v })} max={50} />
        <SelectField label="State" value={f.region} onChange={(v) => set({ region: v })} options={[...STATES.map(([id, name]) => ({ id, label: name })), { id: "INTL", label: "Outside the U.S." }]} />
      </div>
      <Field label="Grade">
        <ChipGroup multiple={false} label="Grade" options={[9, 10, 11, 12].map((g) => ({ id: g, label: `Grade ${g}` }))} value={f.grade} onChange={(v) => set({ grade: v })} />
      </Field>
      <Field label="Stage">
        <ChipGroup multiple={false} label="Stage" options={PERSONAS} value={f.persona} onChange={(v) => set({ persona: v })} />
      </Field>
      <Field label="Interests">
        <ChipGroup label="Interests" options={INTERESTS} value={f.interests || []} onChange={(v) => set({ interests: v })} />
      </Field>
      <TextField label="Other interest" value={f.customInterest} onInput={(v) => set({ customInterest: v })} max={100} />
      <Field label="Goals">
        <ChipGroup label="Goals" options={GOALS} value={f.goals || []} onChange={(v) => set({ goals: v })} />
      </Field>
      <Field label={`About ${f.weeklyHours ?? 5} hours a week`}>
        <input class="range" type="range" min="0" max="20" value={f.weeklyHours ?? 5} onInput={(e) => set({ weeklyHours: Number(e.currentTarget.value) })} aria-label="Hours a week" />
      </Field>
      <Field label="Budget">
        <ChipGroup multiple={false} label="Budget" options={BUDGETS} value={f.budget} onChange={(v) => set({ budget: v })} />
      </Field>
      <Field label="Format">
        <ChipGroup multiple={false} label="Format" options={FORMAT_PREFS} value={f.format} onChange={(v) => set({ format: v })} />
      </Field>
      <Field label="College location">
        <ChipGroup multiple={false} label="College location" options={STUDY_LOCATIONS} value={f.studyLocation} onChange={(v) => set({ studyLocation: v })} />
      </Field>
    </Sheet>
  );
}

function BragSheet({ profile, items }) {
  const acts = items.filter((a) => a.kind === "activity");
  const honors = items.filter((a) => a.kind === "honor");
  return (
    <div class="brag haze" aria-hidden="true">
      <h1>{profile.firstName || "Student"} · Brag sheet</h1>
      <p>
        {profile.grade ? `Grade ${profile.grade}` : ""}
        {profile.region ? ` · ${regionLabel(profile.region)}` : ""}
      </p>
      {profile.summary && <p>{profile.summary}</p>}
      <h2>Activities</h2>
      <ol>
        {acts.map((a) => (
          <li key={a.id}>
            <strong>{a.title}</strong>
            {a.role || a.organization ? ` — ${[a.role, a.organization].filter(Boolean).join(", ")}` : ""}
            <br />
            {a.description}
            <br />
            <small>
              {gradesLabel(a.grades)}
              {a.hoursPerWeek ? ` · ${a.hoursPerWeek} hr/wk` : ""}
              {a.weeksPerYear ? ` · ${a.weeksPerYear} wk/yr` : ""}
            </small>
          </li>
        ))}
      </ol>
      {honors.length > 0 && (
        <>
          <h2>Honors</h2>
          <ol>
            {honors.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong>
                {a.recognition ? ` — ${label("honor", a.recognition)}` : ""} <small>{gradesLabel(a.grades)}</small>
              </li>
            ))}
          </ol>
        </>
      )}
      {(profile.skills || []).length > 0 && (
        <>
          <h2>Skills</h2>
          <p>{profile.skills.join(", ")}</p>
        </>
      )}
      <p class="brag__foot">Made with Sparrow</p>
    </div>
  );
}
