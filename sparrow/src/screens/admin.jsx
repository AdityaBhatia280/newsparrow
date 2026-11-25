import { useEffect, useState } from "preact/hooks";
import { COSTS, FORMATS, INTERESTS, OPPORTUNITY_TYPES } from "../../../shared/taxonomy.mjs";
import { api, uuid } from "../lib/api.js";
import { label, timeAgo } from "../lib/format.js";
import { useApi, useDebounced, useTitle } from "../lib/hooks.js";
import { route, setQuery } from "../lib/router.js";
import { session, toast } from "../lib/store.js";
import { AiConsent, AiError } from "../ui/ai.jsx";
import { Button, ChipGroup, Empty, ExternalLink, Field, Glass, Notice, PageHead, Segmented, SelectField, Sheet, Skeleton, Tag, TextField } from "../ui/kit.jsx";

const blank = { title: "", provider: "", type: "program", interests: [], grades: [9, 10, 11, 12], format: "varies", location: "", cost: "unknown", summary: "", officialUrl: "", eligibility: "", timeCommitment: "", deadline: "", deadlineNote: "" };

function toFields(src = {}) {
  return {
    ...blank,
    ...Object.fromEntries(Object.entries(src).filter(([k, v]) => k in blank && v !== null && v !== undefined)),
  };
}
function toPayload(f) {
  return {
    title: f.title.trim(), provider: f.provider.trim(), type: f.type, interests: f.interests, grades: f.grades, format: f.format,
    location: f.location?.trim() || null, cost: f.cost, summary: f.summary.trim(), officialUrl: f.officialUrl.trim(),
    eligibility: f.eligibility?.trim() || null, timeCommitment: f.timeCommitment?.trim() || null, deadline: f.deadline || null, deadlineNote: f.deadlineNote?.trim() || null,
  };
}

export function Admin() {
  useTitle("Reviewer tools");
  const tab = route.value.query.get("tab") || "queue";
  const stats = useApi("/api/admin/stats");
  if (!session.value?.user?.isAdmin) return <Glass><Empty icon="lock" title="Reviewers only">This area is for Sparrow reviewers.</Empty></Glass>;
  const s = stats.data;
  return (
    <div class="admin">
      <PageHead kicker="Reviewer tools" pre="Keep it" accent="real" />
      {s && (
        <ul class="stat-row list-reset">
          {[
            ["Students", s.users],
            ["Onboarded", s.onboarded],
            ["Listings", s.opportunities],
            ["Verified", s.verified],
            ["Waiting", s.pending],
          ].map(([k, v]) => (
            <li key={k}>
              <div class="stat glass">
                <strong>{v}</strong>
                <span>{k}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Segmented
        label="Section"
        value={tab}
        onChange={(v) => setQuery({ tab: v === "queue" ? null : v })}
        options={[
          { id: "queue", label: "Review queue" },
          { id: "catalog", label: "Catalog" },
          { id: "activity", label: "Activity" },
        ]}
      />
      {tab === "queue" && <Queue onChange={stats.reload} />}
      {tab === "catalog" && <Catalog />}
      {tab === "activity" && <Activity />}
    </div>
  );
}

function Queue({ onChange }) {
  const { data, loading, reload } = useApi("/api/admin/queue");
  const [open, setOpen] = useState(null);
  if (loading && !data) return <Skeleton count={2} height={140} />;
  const items = data?.items || [];
  return (
    <div class="stack">
      {!items.length && (
        <Glass>
          <Empty icon="party" title="Queue is clear">New suggestions from students will appear here.</Empty>
        </Glass>
      )}
      {items.map((s) => (
        <Glass key={s.id} pad="lg" class="stack">
          <div class="row row--between" style={{ alignItems: "flex-start" }}>
            <div class="stack stack--sm" style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: "18px" }}>{s.title || s.extracted?.title || s.sourceTitle || "Untitled"}</h3>
              <ExternalLink href={s.url} class="small">
                {s.url}
              </ExternalLink>
              <p class="small muted">
                From {s.submitter} · {timeAgo(s.updatedAt)} {s.correctionOf ? `· Correction for ${s.correctionOf.title}` : ""}
              </p>
            </div>
            <Tag tone="blue">{label("type", s.type || s.extracted?.type, "Type not set")}</Tag>
          </div>
          {s.notes && <p class="muted">"{s.notes}"</p>}
          <div>
            <Button size="sm" onClick={() => setOpen(s)}>
              Review
            </Button>
          </div>
        </Glass>
      ))}
      <ReviewSheet
        item={open}
        onClose={() => setOpen(null)}
        onDone={() => {
          setOpen(null);
          reload();
          onChange();
        }}
      />
    </div>
  );
}

function ListingForm({ f, set }) {
  return (
    <>
      <div class="two-col">
        <TextField label="Title" value={f.title} onInput={(v) => set({ title: v })} max={180} />
        <TextField label="Organization" value={f.provider} onInput={(v) => set({ provider: v })} max={180} />
      </div>
      <TextField label="Official link" type="url" value={f.officialUrl} onInput={(v) => set({ officialUrl: v })} max={2000} />
      <TextField label="Summary" multiline rows={3} value={f.summary} onInput={(v) => set({ summary: v })} max={600} counter />
      <div class="two-col">
        <SelectField label="Type" value={f.type} options={OPPORTUNITY_TYPES} onChange={(v) => v && set({ type: v })} />
        <SelectField label="Format" value={f.format} options={FORMATS} onChange={(v) => v && set({ format: v })} />
      </div>
      <div class="two-col">
        <SelectField label="Cost" value={f.cost} options={COSTS} onChange={(v) => v && set({ cost: v })} />
        <TextField label="Location" value={f.location} onInput={(v) => set({ location: v })} max={120} />
      </div>
      <Field label="Grades">
        <ChipGroup size="sm" label="Grades" options={[9, 10, 11, 12].map((g) => ({ id: g, label: String(g) }))} value={f.grades} onChange={(v) => set({ grades: v.sort((a, b) => a - b) })} />
      </Field>
      <Field label="Interests">
        <ChipGroup size="sm" label="Interests" options={INTERESTS.filter((i) => i.id !== "exploring")} value={f.interests} onChange={(v) => set({ interests: v.slice(0, 6) })} />
      </Field>
      <TextField label="Eligibility" value={f.eligibility} onInput={(v) => set({ eligibility: v })} max={400} />
      <div class="two-col">
        <TextField label="Deadline (verified only)" type="date" value={f.deadline} onInput={(v) => set({ deadline: v })} />
        <TextField label="Deadline wording" value={f.deadlineNote} onInput={(v) => set({ deadlineNote: v })} max={200} />
      </div>
      <TextField label="Time commitment" value={f.timeCommitment} onInput={(v) => set({ timeCommitment: v })} max={160} />
    </>
  );
}

function ReviewSheet({ item, onClose, onDone }) {
  const [f, setF] = useState(toFields());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (item) setF(toFields({ ...item.extracted, title: item.extracted?.title || item.title || "", type: item.extracted?.type || item.type || "program", officialUrl: item.url }));
    setReason("");
    setError(null);
  }, [item?.id]);
  if (!item) return <Sheet open={false} onClose={onClose} title="" />;
  const decide = async (decision) => {
    setBusy(decision);
    setError(null);
    try {
      const r = await api.post(`/api/admin/submissions/${item.id}/decision`, { decision, reason, ...(decision === "approve" ? { fields: toPayload(f) } : {}) });
      toast(decision === "approve" ? `Approved${r.reward ? ` · +${r.reward.points} points to the student` : ""}.` : "Decision saved.", "ok");
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title="Review suggestion"
      wide
      footer={
        <>
          <Button variant="ghost" size="sm" loading={busy === "duplicate"} onClick={() => decide("duplicate")}>
            Duplicate
          </Button>
          <Button variant="danger" size="sm" loading={busy === "reject"} onClick={() => decide("reject")}>
            Reject
          </Button>
          <Button variant="quiet" size="sm" loading={busy === "needs_changes"} onClick={() => decide("needs_changes")}>
            Needs changes
          </Button>
          <Button icon="check" loading={busy === "approve"} onClick={() => decide("approve")}>
            Approve & publish
          </Button>
        </>
      }
    >
      <Notice icon="info">
        Open <ExternalLink href={item.url}>the official page</ExternalLink> and check every field. Approving with quoted evidence marks the listing as verified.
      </Notice>
      {item.evidence?.length > 0 && (
        <Glass class="stack stack--sm">
          <p class="field__label">Quotes from the page</p>
          {item.evidence.map((e) => (
            <p key={e.field} class="small">
              <strong>{e.field}:</strong> "{e.excerpt}"
            </p>
          ))}
        </Glass>
      )}
      <ListingForm f={f} set={(p) => setF({ ...f, ...p })} />
      <TextField label="Reason (required unless approving)" multiline rows={2} value={reason} onInput={setReason} max={500} hint="The student sees this." />
      <AiError error={error} />
    </Sheet>
  );
}

function Catalog() {
  const [q, setQ] = useState("");
  const typed = useDebounced(q, 300);
  const [status, setStatus] = useState("approved");
  const { data, loading, reload } = useApi(`/api/admin/opportunities?status=${status}&q=${encodeURIComponent(typed)}`);
  const [editing, setEditing] = useState(null);
  return (
    <div class="stack">
      <div class="row row--between">
        <div class="search-field" style={{ flex: "1 1 280px" }}>
          <input class="input" type="search" placeholder="Search listings" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search listings" />
        </div>
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "approved", label: "Live" }, { id: "archived", label: "Archived" }]} />
        <Button icon="plus" onClick={() => setEditing({})}>
          New listing
        </Button>
      </div>
      {loading && !data ? (
        <Skeleton count={4} height={64} />
      ) : (
        <Glass pad={false}>
          <ul class="list-reset admin-list">
            {(data?.items || []).map((o) => (
              <li key={o.id}>
                <div style={{ minWidth: 0 }}>
                  <strong>{o.title}</strong>
                  <p class="small muted">
                    {o.provider} · {label("type", o.type)} · {o.saves} saved
                  </p>
                </div>
                {o.factsVerifiedAt ? <Tag tone="ok" icon="circle-check">Verified</Tag> : <Tag>Unverified</Tag>}
                <Button size="sm" variant="quiet" onClick={() => setEditing(o)}>
                  Edit
                </Button>
              </li>
            ))}
            {!data?.items?.length && <li class="muted">No listings.</li>}
          </ul>
        </Glass>
      )}
      <ListingSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}

function ListingSheet({ item, onClose, onSaved }) {
  const [f, setF] = useState(toFields());
  const [evidence, setEvidence] = useState([]);
  const [check, setCheck] = useState({ consent: false, busy: false, flags: null, error: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (item) setF(toFields(item));
    setEvidence([]);
    setCheck({ consent: false, busy: false, flags: null, error: null });
    setError(null);
  }, [item?.id, !!item]);
  if (!item) return <Sheet open={false} onClose={onClose} title="" />;
  const isNew = !item.id;
  const recheck = async () => {
    setCheck((c) => ({ ...c, busy: true, error: null }));
    try {
      const r = await api.post(`/api/admin/opportunities/${item.id}/recheck`, { requestId: uuid(), confirmed: true });
      setF((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(r.fields).filter(([k]) => k in blank)) }));
      setEvidence(r.evidence);
      setCheck((c) => ({ ...c, busy: false, flags: r.flags }));
    } catch (e) {
      setCheck((c) => ({ ...c, busy: false, error: e }));
    }
  };
  const save = async (extra = {}) => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) await api.post("/api/admin/opportunities", { fields: toPayload(f), evidence, verify: evidence.length > 0 });
      else await api.patch(`/api/admin/opportunities/${item.id}`, { fields: toPayload(f), evidence, verify: evidence.length > 0, ...extra });
      toast("Saved.", "ok");
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (status) => {
    try {
      await api.patch(`/api/admin/opportunities/${item.id}`, { status });
      toast(status === "archived" ? "Archived." : "Restored.", "ok");
      onSaved();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={isNew ? "New listing" : "Edit listing"}
      wide
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" size="sm" onClick={() => setStatus(item.status === "archived" ? "approved" : "archived")} style={{ marginRight: "auto" }}>
              {item.status === "archived" ? "Restore" : "Archive"}
            </Button>
          )}
          <Button icon="check" loading={busy} onClick={() => save()}>
            {evidence.length ? "Save & mark verified" : "Save"}
          </Button>
        </>
      }
    >
      {!isNew && (
        <Glass class="stack">
          <p class="field__label">Re-check the official source</p>
          <AiConsent compact checked={check.consent} onChange={(v) => setCheck((c) => ({ ...c, consent: v }))} what="the text of this listing's official page" />
          <AiError error={check.error} />
          <div>
            <Button size="sm" icon="refresh" loading={check.busy} disabled={!check.consent} onClick={recheck}>
              Fetch and compare
            </Button>
          </div>
          {check.flags?.length > 0 && <Notice tone="warn">{check.flags.join(" ")}</Notice>}
          {evidence.length > 0 && (
            <div class="stack stack--sm">
              {evidence.map((e) => (
                <p key={e.field} class="small">
                  <strong>{e.field}:</strong> "{e.excerpt}"
                </p>
              ))}
              <p class="small muted">Fields above were updated from the page. Check them, then save to mark the listing verified.</p>
            </div>
          )}
        </Glass>
      )}
      <ListingForm f={f} set={(p) => setF({ ...f, ...p })} />
      <AiError error={error} />
    </Sheet>
  );
}

function Activity() {
  const { data, loading } = useApi("/api/admin/audit");
  if (loading && !data) return <Skeleton count={4} height={48} />;
  return (
    <Glass pad={false}>
      <ul class="list-reset admin-list">
        {(data?.items || []).map((e) => (
          <li key={e.id}>
            <div>
              <strong>{e.action}</strong>
              <p class="small muted">
                {e.actor || "Someone"} · {e.targetType} {e.detail?.slug || e.detail?.opportunity || ""}
              </p>
            </div>
            <span class="small muted">{timeAgo(e.createdAt)}</span>
          </li>
        ))}
        {!data?.items?.length && <li class="muted">Nothing yet.</li>}
      </ul>
    </Glass>
  );
}
