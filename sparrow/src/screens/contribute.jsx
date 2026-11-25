import { useEffect, useState } from "preact/hooks";
import { FORMATS, INTERESTS, OPPORTUNITY_TYPES } from "../../../shared/taxonomy.mjs";
import { api, uuid } from "../lib/api.js";
import { dayLabel, label, timeAgo } from "../lib/format.js";
import { useApi, useTitle } from "../lib/hooks.js";
import { navigate, route } from "../lib/router.js";
import { confirmAction, toast } from "../lib/store.js";
import { AiConsent, AiError, useWallet } from "../ui/ai.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, ChipGroup, Empty, ExternalLink, Field, Glass, Notice, PageHead, Ring, SelectField, Skeleton, Tag, TextField } from "../ui/kit.jsx";

const STATUS = {
  draft: ["Draft", undefined, "pencil"],
  pending: ["Waiting for review", "blue", "clock"],
  needs_changes: ["Needs changes", "warn", "info"],
  approved: ["Approved", "ok", "circle-check"],
  rejected: ["Not accepted", "bad", "x"],
  duplicate: ["Already listed", undefined, "copy"],
};

export function Contribute() {
  useTitle("Suggest an opportunity");
  const q = route.value.query;
  const correction = q.get("correction");
  const { data, loading, reload, setData } = useApi("/api/submissions");
  const [url, setUrl] = useState("");
  const [type, setType] = useState(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api.post("/api/submissions", { url, type, title: title || null, notes, correctionOf: correction || null });
      setData((d) => ({ ...d, items: [s, ...(d?.items || [])] }));
      setUrl("");
      setTitle("");
      setNotes("");
      toast("Added. Fetch the details or send it for review.", "ok");
      setTimeout(() => document.getElementById("sub-" + s.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    } catch (err) {
      if (err.slug) {
        toast(err.message);
        navigate(`/app/explore/${err.slug}`);
      } else setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="contribute">
      <PageHead
        kicker="Contribute"
        pre="Suggest"
        accent="an"
        post="opportunity"
        lead="Found a great program, competition or scholarship? Share its official link. A reviewer checks every suggestion, and approved finds earn reward points."
      />
      <div class="detail__layout">
        <div class="stack stack--lg">
          <Glass as="form" pad="lg" class="stack" onSubmit={create}>
            {correction && (
              <Notice icon="pencil">
                You're suggesting a correction to <strong>{correction}</strong>. Add the official page that shows the right information.
              </Notice>
            )}
            <TextField label="Official link" type="url" required placeholder="https://" value={url} onInput={setUrl} max={2000} hint="Use the organization's own page, not a blog or list." />
            <div class="two-col">
              <SelectField label="Type" value={type} placeholder="Choose a type" options={OPPORTUNITY_TYPES} onChange={setType} />
              <TextField label="Name (optional)" value={title} onInput={setTitle} max={180} />
            </div>
            <TextField label="Notes for the reviewer (optional)" multiline rows={3} value={notes} onInput={setNotes} max={2000} />
            <AiError error={error} />
            <div>
              <Button type="submit" icon="plus" loading={busy} disabled={!url}>
                Add suggestion
              </Button>
            </div>
          </Glass>
          <section class="stack">
            <div class="section-title">
              <h2>Your suggestions</h2>
            </div>
            {loading && !data ? (
              <Skeleton count={2} height={120} />
            ) : data?.items?.length ? (
              data.items.map((s) => <Submission key={s.id} s={s} focus={q.get("focus") === s.id} onChange={reload} />)
            ) : (
              <Glass>
                <Empty icon="gift" title="No suggestions yet">
                  Your first approved find earns 50 points and the First find badge.
                </Empty>
              </Glass>
            )}
          </section>
        </div>
        <aside class="detail__side">
          <Glass strong pad="lg" class="stack">
            <h2 class="h-sub">How it works</h2>
            <ol class="list-reset stack how">
              <li>
                <span>1</span> Paste the official link.
              </li>
              <li>
                <span>2</span> Let AI pull the details from the page. Every fact quotes the page.
              </li>
              <li>
                <span>3</span> Fix anything that's off, then send it for review.
              </li>
              <li>
                <span>4</span> A reviewer approves it, and it goes live for everyone.
              </li>
            </ol>
            <p class="small muted">+50 points for a new listing, +20 for an approved correction. Points have no cash value.</p>
            <Button variant="quiet" href="/app/rewards" icon="trophy">
              Your rewards
            </Button>
          </Glass>
        </aside>
      </div>
    </div>
  );
}

function Submission({ s, focus, onChange }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState(s.extracted || {});
  const [flags, setFlags] = useState(s.extracted?.flags || []);
  useEffect(() => {
    setFields(s.extracted || {});
    setFlags(s.extracted?.flags || []);
  }, [s.updatedAt]);
  useEffect(() => {
    if (focus) document.getElementById("sub-" + s.id)?.scrollIntoView({ block: "center" });
  }, []);
  const editable = s.status === "draft" || s.status === "needs_changes";
  const [label_, tone, icon] = STATUS[s.status] || STATUS.draft;
  const evidence = Object.fromEntries((s.evidence || []).map((e) => [e.field, e.excerpt]));
  const extract = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post(`/api/submissions/${s.id}/extract`, { requestId: uuid(), confirmed: true });
      setFields(r.submission.extracted || {});
      setFlags(r.flags || []);
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const saveFields = async () => {
    const { flags: _f, ...rest } = fields;
    try {
      await api.patch(`/api/submissions/${s.id}`, { extracted: clean(rest), type: rest.type || s.type || null, title: rest.title || s.title || null });
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    if (s.extracted && !(await saveFields())) return setBusy(false);
    try {
      await api.post(`/api/submissions/${s.id}/submit`);
      toast("Sent for review. Thanks for helping other students!", "ok");
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: "Delete this suggestion?", body: "It hasn't been reviewed, so nothing else changes.", confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await api.del(`/api/submissions/${s.id}`);
      onChange();
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const set = (patch) => setFields({ ...fields, ...patch });
  const has = Object.keys(fields).some((k) => k !== "flags");
  return (
    <Glass pad="lg" class="stack submission" id={"sub-" + s.id}>
      <div class="row row--between" style={{ alignItems: "flex-start" }}>
        <div class="stack stack--sm" style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: "18px" }}>{s.title || fields.title || s.sourceTitle || "Untitled suggestion"}</h3>
          <ExternalLink href={s.url} class="small">
            {s.url.replace(/^https:\/\//, "").slice(0, 70)}
          </ExternalLink>
        </div>
        <Tag tone={tone} icon={icon}>
          {label_}
        </Tag>
      </div>
      {s.correctionOf && <p class="small muted">Correction for {s.correctionOf.title || s.correctionOf.slug}</p>}
      {s.decisionReason && (
        <Notice tone={s.status === "needs_changes" ? "warn" : undefined}>
          <strong>Reviewer:</strong> {s.decisionReason}
        </Notice>
      )}
      {s.status === "approved" && s.opportunitySlug && (
        <Button variant="quiet" size="sm" href={`/app/explore/${s.opportunitySlug}`} icon="arrow-right">
          See it live
        </Button>
      )}
      {editable && (
        <>
          {!has && (
            <div class="stack">
              <AiConsent compact checked={consent} onChange={setConsent} what="the text of this public page" />
              <div class="row">
                <Button size="sm" icon="wand" loading={busy} disabled={!consent} onClick={extract}>
                  Fetch details with AI
                </Button>
                <Button size="sm" variant="quiet" loading={busy} onClick={submit} disabled={!s.type && !s.title}>
                  Send without details
                </Button>
                <button type="button" class="link-btn link-btn--danger" onClick={remove}>
                  Delete
                </button>
              </div>
            </div>
          )}
          {has && (
            <div class="stack">
              {flags.length > 0 && <Notice tone="warn">{flags.join(" ")}</Notice>}
              <p class="small muted">
                <Icon name="circle-check" size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> marks facts quoted from the page. Edit anything that's
                wrong.
              </p>
              <div class="two-col">
                <EvField label="Name" quote={evidence.title}>
                  <input class="input" value={fields.title || ""} maxLength={180} onInput={(e) => set({ title: e.currentTarget.value })} />
                </EvField>
                <EvField label="Organization" quote={evidence.provider}>
                  <input class="input" value={fields.provider || ""} maxLength={180} onInput={(e) => set({ provider: e.currentTarget.value })} />
                </EvField>
              </div>
              <EvField label="Summary" quote={evidence.summary}>
                <textarea class="textarea" rows={3} value={fields.summary || ""} maxLength={600} onInput={(e) => set({ summary: e.currentTarget.value })} />
              </EvField>
              <div class="two-col">
                <SelectField label="Type" value={fields.type || s.type} options={OPPORTUNITY_TYPES} placeholder="Choose a type" onChange={(v) => set({ type: v })} />
                <SelectField label="Format" value={fields.format} options={FORMATS} placeholder="Not stated" onChange={(v) => set({ format: v })} />
              </div>
              <EvField label="Who can apply" quote={evidence.eligibility}>
                <input class="input" value={fields.eligibility || ""} maxLength={400} onInput={(e) => set({ eligibility: e.currentTarget.value })} />
              </EvField>
              <div class="two-col">
                <EvField label="Deadline" quote={evidence.deadline}>
                  <input class="input" type="date" value={fields.deadline || ""} onInput={(e) => set({ deadline: e.currentTarget.value || null })} />
                </EvField>
                <SelectField
                  label="Cost"
                  value={fields.cost}
                  placeholder="Not stated"
                  options={[{ id: "free", label: "Free" }, { id: "paid", label: "Fee" }, { id: "varies", label: "Varies" }]}
                  onChange={(v) => set({ cost: v })}
                />
              </div>
              <Field label="Interests">
                <ChipGroup size="sm" label="Interests" options={INTERESTS.filter((i) => i.id !== "exploring")} value={fields.interests || []} onChange={(v) => set({ interests: v })} />
              </Field>
              <div class="row">
                <Button icon="send" loading={busy} onClick={submit}>
                  Send for review
                </Button>
                <Button variant="quiet" size="sm" onClick={async () => (await saveFields()) && toast("Saved.", "ok")}>
                  Save draft
                </Button>
                <button type="button" class="link-btn link-btn--danger" onClick={remove}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <AiError error={error} />
      <p class="small muted">Added {timeAgo(s.createdAt)}</p>
    </Glass>
  );
}

function EvField({ label: text, quote, children }) {
  return (
    <div class="field">
      <span class="field__label">
        {text} {quote && <Icon name="circle-check" size={14} style={{ display: "inline", verticalAlign: "-2px", color: "var(--ok)" }} title={`From the page: "${quote}"`} />}
      </span>
      {children}
      {quote && <span class="field__hint">"{quote.slice(0, 140)}{quote.length > 140 ? "…" : ""}"</span>}
    </div>
  );
}

function clean(f) {
  const out = {};
  for (const [k, v] of Object.entries(f)) {
    if (["title", "provider", "summary", "eligibility", "location", "deadlineNote", "timeCommitment"].includes(k)) out[k] = v ? String(v) : null;
    else if (["type", "format", "cost", "deadline"].includes(k)) out[k] = v || null;
    else if (["grades", "interests"].includes(k)) out[k] = Array.isArray(v) ? v : [];
  }
  return out;
}

export function Rewards() {
  useTitle("Rewards");
  const { data } = useApi("/api/rewards");
  const wallet = useWallet();
  if (!data) return <Skeleton count={3} height={160} />;
  const left = wallet?.remainingPercent ?? wallet?.prepaidRemainingPercent;
  return (
    <div class="rewards">
      <PageHead kicker="Rewards & AI usage" pre="Your" accent="rewards" />
      <div class="rewards__top">
        <Glass strong pad="lg" class="points reveal">
          <p class="kicker">Reward points</p>
          <p class="points__value">{data.points.toLocaleString("en-US")}</p>
          <p class="muted">
            {data.approved} approved {data.approved === 1 ? "find" : "finds"}
            {data.corrections ? ` · ${data.corrections} ${data.corrections === 1 ? "correction" : "corrections"}` : ""}
            {data.pending ? ` · ${data.pending} waiting for review` : ""}
          </p>
          <Button href="/app/contribute" icon="plus">
            Suggest an opportunity
          </Button>
          <p class="small muted">Points celebrate helping other students. They have no cash value and can't be bought, sold or traded.</p>
        </Glass>
        <Glass pad="lg" class="stack reveal" style={{ animationDelay: "0.06s" }}>
          <p class="kicker">AI allowance</p>
          {wallet?.reachable ? (
            <>
              <div class="row" style={{ gap: "16px" }}>
                <Ring value={left ?? 0} size={72} />
                <div>
                  <p class="points__ai">{Number.isFinite(left) ? `${left}% left` : "Connected"}</p>
                  <p class="small muted">{wallet.usingOwnKey ? `Using your own publik key (…${wallet.ownKeyHint})` : wallet.planLabel || "publik account"}</p>
                </div>
              </div>
              {!wallet.hasPlan && !wallet.usingOwnKey && (
                <div class="row">
                  {wallet.topUpUrl && (
                    <Button href={wallet.topUpUrl} iconRight="arrow-up-right" size="sm">
                      Get a plan
                    </Button>
                  )}
                  <Button variant="quiet" size="sm" href="/app/settings#ai">
                    Use my own key
                  </Button>
                </div>
              )}
              <p class="small muted">AI runs on your publik account and is billed by publik, separately from Sparrow points.</p>
            </>
          ) : (
            <p class="muted">publik isn't reachable right now.</p>
          )}
        </Glass>
      </div>
      <section class="stack">
        <div class="section-title">
          <h2>Badges</h2>
        </div>
        <div class="badges stagger">
          {data.badges.map((b) => (
            <Glass key={b.id} class={"badge" + (b.earned ? " badge--earned" : "")}>
              <span class="tile" aria-hidden="true">
                <Icon name={b.earned ? "medal" : "lock"} />
              </span>
              <div>
                <strong>{b.label}</strong>
                <p class="small muted">{b.description}</p>
              </div>
              <span class="visually-hidden">{b.earned ? "Earned" : "Not earned yet"}</span>
            </Glass>
          ))}
        </div>
      </section>
      <section class="stack">
        <div class="section-title">
          <h2>History</h2>
        </div>
        {data.history.length ? (
          <Glass pad={false}>
            <ul class="list-reset ledger">
              {data.history.map((h) => (
                <li key={h.id}>
                  <span>{h.reason}</span>
                  <span class="muted small">{dayLabel(h.createdAt.slice(0, 10), { year: true })}</span>
                  <strong>+{h.points}</strong>
                </li>
              ))}
            </ul>
          </Glass>
        ) : (
          <p class="muted">No points yet. Approved suggestions show up here.</p>
        )}
      </section>
    </div>
  );
}
