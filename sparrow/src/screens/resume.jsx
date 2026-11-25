// Resume → activities. The file is read in the browser; contact details are removed before anything is shown or sent.
import { useState } from "preact/hooks";
import { BY_ID, LIMITS } from "../../../shared/taxonomy.mjs";
import { heuristicResume, redactContact } from "../../../shared/text.mjs";
import { api, uuid } from "../lib/api.js";
import { readResume } from "../lib/resume.js";
import { AiConsent, AiError } from "../ui/ai.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, Chip, Glass, Notice, Tag } from "../ui/kit.jsx";

export function ResumeImport({ onDone, onSkip, existing = { activity: 0, honor: 0 }, skipLabel = "I'm just getting started" }) {
  const [stage, setStage] = useState("pick");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [items, setItems] = useState([]);
  const [interests, setInterests] = useState([]);
  const [drag, setDrag] = useState(false);

  const load = async (file) => {
    if (!file) return;
    setError(null);
    setStage("reading");
    try {
      const raw = await readResume(file);
      setText(redactContact(raw));
      setFileName(file.name);
      setStage("review");
    } catch (e) {
      setError({ message: e.message });
      setStage("pick");
    }
  };

  const useResult = (r, usedAi) => {
    const room = { activity: LIMITS.activities - existing.activity, honor: LIMITS.honors - existing.honor };
    const seen = { activity: 0, honor: 0 };
    setItems(
      (r.activities || []).map((a) => {
        const kind = a.kind === "honor" ? "honor" : "activity";
        return { ...a, kind, description: a.description ? a.description.slice(0, LIMITS.description) : null, keep: ++seen[kind] <= room[kind] };
      }),
    );
    setInterests(r.suggestedInterests || []);
    setResult({ ...r, usedAi });
    setStage("results");
  };

  const analyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const clean = redactContact(text);
      setText(clean);
      useResult(await api.post("/api/resume/analyze", { text: clean, requestId: uuid(), confirmed: true }), true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const chosen = items.filter((i) => i.keep);
    setBusy(true);
    setError(null);
    try {
      if (chosen.length)
        await api.post("/api/activities", {
          items: chosen.map((a) => ({
            kind: a.kind,
            category: a.category || null,
            title: a.title.slice(0, 100),
            role: a.role ? a.role.slice(0, LIMITS.position) : null,
            organization: a.organization ? a.organization.slice(0, LIMITS.organization) : null,
            description: a.description ? a.description.slice(0, LIMITS.description) : null,
            grades: a.grades || [],
            hoursPerWeek: a.hoursPerWeek ?? null,
            weeksPerYear: a.weeksPerYear ?? null,
            recognition: a.kind === "honor" ? a.recognition ?? null : null,
            source: "resume",
          })),
        });
      const profile = await api.get("/api/profile");
      await api.patch("/api/profile", {
        skills: [...new Set([...(profile.skills || []), ...(result.skills || [])])].slice(0, 20),
        interests: [...new Set([...(profile.interests || []), ...interests])].filter((i) => i !== "exploring" || !interests.length),
        ...(result.summary ? { experience: result.summary } : {}),
      });
      onDone?.({ added: chosen.length });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const update = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  if (stage === "pick" || stage === "reading")
    return (
      <div class="stack stack--lg">
        <label
          class={"dropzone" + (drag ? " dropzone--over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            load(e.dataTransfer?.files?.[0]);
          }}
        >
          <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(e) => load(e.currentTarget.files?.[0])} />
          <span class="tile tile--lg" aria-hidden="true">
            <Icon name={stage === "reading" ? "loader" : "upload"} class={stage === "reading" ? "spin" : ""} />
          </span>
          <strong>{stage === "reading" ? "Reading your resume…" : "Drop your resume here, or choose a file"}</strong>
          <span class="muted">PDF, Word (.docx) or text, up to 5 MB. The file stays on your device.</span>
        </label>
        <AiError error={error} />
        <div class="row" style={{ justifyContent: "center" }}>
          <Button
            variant="quiet"
            icon="file-text"
            onClick={() => {
              setText("");
              setStage("review");
            }}
          >
            Paste text instead
          </Button>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              {skipLabel}
            </Button>
          )}
        </div>
      </div>
    );

  if (stage === "review")
    return (
      <div class="stack stack--lg">
        <Notice icon="shield">
          {fileName ? (
            <>
              We read <strong>{fileName}</strong> on your device and removed emails, phone numbers, links and addresses. Edit anything else you'd rather not
              share.
            </>
          ) : (
            "Paste your resume or a list of your activities. Emails, phone numbers, links and addresses are removed automatically."
          )}
        </Notice>
        <div class="haze doc">
          <label class="visually-hidden" for="resume-text">
            Resume text
          </label>
          <textarea
            id="resume-text"
            class="doc__text"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            onBlur={(e) => setText(redactContact(e.currentTarget.value))}
            placeholder="Activities, awards, jobs, skills…"
          />
        </div>
        <AiConsent checked={consent} onChange={setConsent} what="this text (no contact details)" />
        <AiError error={error} />
        <div class="row">
          <Button icon="sparkles" loading={busy} disabled={!consent || text.trim().length < 40} onClick={analyze}>
            Analyze with AI
          </Button>
          <Button variant="quiet" disabled={busy || text.trim().length < 20} onClick={() => useResult(heuristicResume(redactContact(text)), false)}>
            Find sections without AI
          </Button>
          <button type="button" class="link-btn" onClick={() => setStage("pick")}>
            Choose a different file
          </button>
        </div>
      </div>
    );

  const kept = items.filter((i) => i.keep);
  const over = { activity: kept.filter((i) => i.kind === "activity").length + existing.activity > LIMITS.activities, honor: kept.filter((i) => i.kind === "honor").length + existing.honor > LIMITS.honors };
  return (
    <div class="stack stack--lg">
      {result.summary && (
        <Glass class="stack stack--sm">
          <p class="kicker">{result.usedAi ? "What the AI noticed" : "Summary"}</p>
          <p>{result.summary}</p>
        </Glass>
      )}
      {!items.length && <Notice>No activities were found. You can add them yourself in your profile any time.</Notice>}
      <div class="stack stack--sm">
        {items.map((a, i) => (
          <Glass key={i} class={"import-item" + (a.keep ? "" : " import-item--off")}>
            <label class="check import-item__keep">
              <input type="checkbox" checked={a.keep} onChange={(e) => update(i, { keep: e.currentTarget.checked })} />
              <span class="visually-hidden">Keep {a.title}</span>
            </label>
            <div class="import-item__body">
              <div class="row" style={{ gap: "8px" }}>
                <Tag tone={a.kind === "honor" ? "blue" : undefined} icon={a.kind === "honor" ? "medal" : "star"}>
                  {a.kind === "honor" ? "Honor" : "Activity"}
                </Tag>
                {a.category && <Tag>{a.category}</Tag>}
              </div>
              <input class="input import-item__title" value={a.title} maxLength={100} aria-label="Name" onInput={(e) => update(i, { title: e.currentTarget.value })} />
              {a.kind === "activity" && (
                <input
                  class="input"
                  value={a.role || ""}
                  maxLength={LIMITS.position}
                  placeholder="Position or role"
                  aria-label="Position or role"
                  onInput={(e) => update(i, { role: e.currentTarget.value })}
                />
              )}
              <textarea
                class="textarea"
                rows={2}
                value={a.description || ""}
                maxLength={LIMITS.description}
                placeholder="What you did (150 characters)"
                aria-label="Description"
                onInput={(e) => update(i, { description: e.currentTarget.value })}
              />
              <span class="counter">{(a.description || "").length}/150</span>
            </div>
          </Glass>
        ))}
      </div>
      {(over.activity || over.honor) && <Notice tone="warn">You can keep up to 10 activities and 5 honors. Uncheck a few to continue.</Notice>}
      {(result.skills?.length > 0 || interests.length > 0) && (
        <div class="stack stack--sm">
          {result.skills?.length > 0 && (
            <>
              <p class="field__label">Skills we'll add</p>
              <div class="chips">
                {result.skills.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </div>
            </>
          )}
          {interests.length > 0 && (
            <>
              <p class="field__label">Interests that match your activities</p>
              <div class="chips">
                {interests.map((id) => (
                  <Chip key={id} size="sm" selected icon={BY_ID.interest[id]?.icon} onClick={() => setInterests(interests.filter((x) => x !== id))}>
                    {BY_ID.interest[id]?.label}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <AiError error={error} />
      <div class="row">
        <Button icon="check" loading={busy} disabled={over.activity || over.honor} onClick={save}>
          {kept.length ? `Save ${kept.length} ${kept.length === 1 ? "item" : "items"}` : "Continue"}
        </Button>
        <button type="button" class="link-btn" onClick={() => setStage("review")}>
          Back to the text
        </button>
      </div>
    </div>
  );
}
