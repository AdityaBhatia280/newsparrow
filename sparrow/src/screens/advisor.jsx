import { useEffect, useRef, useState } from "preact/hooks";
import { api, uuid } from "../lib/api.js";
import { timeAgo } from "../lib/format.js";
import { useApi, useTitle } from "../lib/hooks.js";
import { navigate, route } from "../lib/router.js";
import { confirmAction, toast } from "../lib/store.js";
import { AiConsent, AiError } from "../ui/ai.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, Check, Display, Glass, IconButton, Notice, Segmented, Sheet, Tag } from "../ui/kit.jsx";

const STARTERS = [
  { task: "Build a realistic plan", icon: "target", text: "Help me make a realistic plan for the next month that fits my schedule." },
  { task: "Compare my choices", icon: "grid", text: "Compare the opportunities and colleges I selected and tell me what to check next." },
  { task: "Break down a project", icon: "list-checks", text: "Help me break a project I want to start into small milestones." },
  { task: "Review a draft", icon: "pen-tool", text: "Give me feedback on this draft without rewriting it for me:\n\n" },
  { task: "Brainstorm activities", icon: "lightbulb", text: "Suggest kinds of activities I could try based on my interests and time." },
  { task: "Make an application checklist", icon: "check", text: "Make me a checklist of what to prepare for an application I'm planning." },
];
const TIERS = [
  { id: "fast", label: "Quick" },
  { id: "balanced", label: "Balanced" },
  { id: "smart", label: "Deep" },
];
const DRAFT_KEY = "sparrow.advisor.draft";

export function Advisor() {
  useTitle("Advisor");
  const q = route.value.query;
  const threads = useApi("/api/advisor/threads");
  const [threadId, setThreadId] = useState(q.get("thread"));
  const [messages, setMessages] = useState([]);
  const [task, setTask] = useState("Ask anything");
  const [text, setText] = useState(() => {
    try {
      return q.get("q") || sessionStorage.getItem(DRAFT_KEY) || "";
    } catch {
      return q.get("q") || "";
    }
  });
  const [tier, setTier] = useState("balanced");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctx, setCtx] = useState({ profile: true, experience: false, opportunityIds: [], collegeIds: [] });
  const [listOpen, setListOpen] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, text);
    } catch {}
  }, [text]);

  // Context from links like ?opportunity=… or ?colleges=1,2&task=compare
  useEffect(() => {
    const opp = q.get("opportunity");
    const cols = [q.get("college"), ...(q.get("colleges") || "").split(",")].filter(Boolean).map(Number).filter(Boolean);
    if (opp || cols.length) {
      setCtx((c) => ({ ...c, opportunityIds: opp ? [...new Set([...c.opportunityIds, opp])] : c.opportunityIds, collegeIds: [...new Set([...c.collegeIds, ...cols])].slice(0, 6) }));
      setTask("Compare my choices");
      if (!text) setText(opp ? "What should I know about this opportunity, and what should I do next?" : cols.length > 1 ? "Compare these colleges for me." : "What should I research about this college?");
    }
  }, []);

  useEffect(() => {
    if (!threadId) return setMessages([]);
    api
      .get(`/api/advisor/threads/${threadId}`)
      .then((r) => {
        setMessages(r.messages);
        setTask(r.thread.task);
      })
      .catch(() => setThreadId(null));
  }, [threadId]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post("/api/advisor", {
        threadId: threadId || null,
        task,
        message: text.trim(),
        include: { profile: ctx.profile, experience: ctx.experience },
        opportunityIds: ctx.opportunityIds,
        collegeIds: ctx.collegeIds,
        tier,
        requestId: uuid(),
        confirmed: true,
      });
      setMessages((m) => [...m, ...r.messages]);
      setText("");
      if (!threadId) {
        setThreadId(r.thread.id);
        navigate(`/app/advisor?thread=${r.thread.id}`, { replace: true, scroll: false });
      }
      threads.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const newThread = () => {
    setThreadId(null);
    setMessages([]);
    setTask("Ask anything");
    setError(null);
    setListOpen(false);
    navigate("/app/advisor", { replace: true, scroll: false });
  };

  const removeThread = async (t) => {
    if (!(await confirmAction({ title: "Delete this conversation?", body: "It will be removed from your advisor history.", confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await api.del(`/api/advisor/threads/${t.id}`);
      if (t.id === threadId) newThread();
      threads.reload();
    } catch (err) {
      toast(err.message, "bad");
    }
  };

  const addTask = async (title) => {
    try {
      await api.post("/api/tasks", { title: title.slice(0, 200), source: "advisor" });
      toast("Added to your tasks.", "ok");
    } catch (err) {
      toast(err.message, "bad");
    }
  };

  const contextCount = ctx.opportunityIds.length + ctx.collegeIds.length + (ctx.profile ? 1 : 0) + (ctx.experience ? 1 : 0);
  const list = threads.data?.items || [];
  const History = (
    <div class="stack stack--sm">
      <Button variant="quiet" icon="plus" block onClick={newThread}>
        New conversation
      </Button>
      <ul class="list-reset thread-list">
        {list.map((t) => (
          <li key={t.id} class={t.id === threadId ? "is-active" : ""}>
            <button
              type="button"
              class="thread-list__open"
              onClick={() => {
                setThreadId(t.id);
                setListOpen(false);
                navigate(`/app/advisor?thread=${t.id}`, { replace: true, scroll: false });
              }}
            >
              <span>{t.title}</span>
              <span class="small muted">{timeAgo(t.updatedAt)}</span>
            </button>
            <IconButton icon="trash" label={`Delete ${t.title}`} class="icon-btn--plain" onClick={() => removeThread(t)} />
          </li>
        ))}
        {!list.length && <li class="small muted thread-list__empty">Your conversations will appear here.</li>}
      </ul>
    </div>
  );

  return (
    <div class="advisor">
      <aside class="advisor__rail glass">{History}</aside>
      <section class="advisor__main">
        <header class="advisor__head reveal">
          <div>
            <p class="kicker">Advisor</p>
            <Display pre="Ask" accent="your" post="advisor" size="md" />
          </div>
          <Button variant="quiet" icon="history" class="advisor__history-btn" onClick={() => setListOpen(true)}>
            History
          </Button>
        </header>
        {!messages.length && (
          <div class="starter-grid stagger">
            {STARTERS.map((s) => (
              <button
                key={s.task}
                type="button"
                class="starter glass glass--interactive"
                aria-pressed={String(task === s.task)}
                onClick={() => {
                  setTask(s.task);
                  setText(s.text);
                  document.getElementById("advisor-input")?.focus();
                }}
              >
                <span class="tile tile--sm" aria-hidden="true">
                  <Icon name={s.icon} />
                </span>
                <strong>{s.task}</strong>
              </button>
            ))}
          </div>
        )}
        <ol class="list-reset conversation" aria-live="polite">
          {messages.map((m) => (m.role === "user" ? <UserMessage key={m.id} m={m} /> : <Answer key={m.id} m={m} onTask={addTask} onFollow={(t) => setText(t)} />))}
          {busy && (
            <li class="answer answer--thinking glass">
              <span class="spinner-orb" style={{ width: "28px", height: "28px" }} aria-hidden="true" />
              <span class="muted">Thinking it through…</span>
            </li>
          )}
          <li ref={end} aria-hidden="true" />
        </ol>
        <form class="composer glass glass--strong" onSubmit={send}>
          <label class="visually-hidden" for="advisor-input">
            Your question
          </label>
          <textarea
            id="advisor-input"
            class="composer__input"
            rows={3}
            maxLength={4000}
            placeholder="Ask for a plan, a comparison, or feedback on a draft…"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
            }}
          />
          <div class="composer__bar">
            <Segmented label="Depth" options={TIERS} value={tier} onChange={setTier} />
            <Button variant="quiet" size="sm" icon="sliders" onClick={() => setCtxOpen(true)}>
              Context ({contextCount})
            </Button>
          </div>
          <AiConsent checked={consent} onChange={setConsent} what={`your question${contextCount ? " and the context you chose" : ""}`} compact />
          <AiError error={error} />
          <div class="composer__send">
            <span class="small muted">{tier === "smart" ? "Deep uses more of your allowance." : "Ctrl + Enter to send"}</span>
            <Button type="submit" icon="send" loading={busy} disabled={!consent || !text.trim()}>
              Send
            </Button>
          </div>
        </form>
        <p class="small muted" style={{ textAlign: "center" }}>
          AI can make mistakes. Sparrow only gives it facts it can show you; check important details on official sites.
        </p>
      </section>
      <ContextSheet open={ctxOpen} onClose={() => setCtxOpen(false)} value={ctx} onChange={setCtx} />
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Your conversations">
        {History}
      </Sheet>
    </div>
  );
}

function UserMessage({ m }) {
  return (
    <li class="bubble">
      <p>{m.content.text}</p>
      <span class="small muted">{m.content.task}</span>
    </li>
  );
}

function Answer({ m, onTask, onFollow }) {
  const a = m.content;
  return (
    <li class="answer glass">
      <div class="answer__head">
        <span class="tile tile--sm" aria-hidden="true">
          <Icon name="sparkles" />
        </span>
        <span class="small muted">
          Sparrow advisor · {m.tier === "smart" ? "Deep" : m.tier === "fast" ? "Quick" : "Balanced"}
        </span>
      </div>
      <p class="answer__summary">{a.summary}</p>
      {a.recommendations?.length > 0 && (
        <ol class="list-reset stack">
          {a.recommendations.map((r, n) => (
            <li key={n} class="rec">
              <span class="rec__num">{n + 1}</span>
              <div class="stack stack--sm">
                <strong>{r.title}</strong>
                <p class="muted">{r.reason}</p>
                <div class="row" style={{ gap: "6px" }}>
                  {Number.isFinite(r.estimatedMinutes) && <Tag icon="clock">About {r.estimatedMinutes} min (estimate)</Tag>}
                  {r.opportunityId && <Tag tone="blue" icon="compass">From your saved opportunity</Tag>}
                  {r.collegeId && (
                    <a class="tag tag--blue" href={`/app/colleges/${r.collegeId}`}>
                      <Icon name="graduation-cap" /> College data
                    </a>
                  )}
                </div>
                {r.uncertainties?.length > 0 && (
                  <ul class="small muted rec__check">
                    {r.uncertainties.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                )}
                <div>
                  <Button size="sm" variant="quiet" icon="plus" onClick={() => onTask(r.title)}>
                    Add as task
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {a.followUpQuestion && (
        <button type="button" class="follow" onClick={() => onFollow(a.followUpQuestion + " ")}>
          <Icon name="message" size={16} /> {a.followUpQuestion}
        </button>
      )}
      {a.warnings?.length > 0 && (
        <Notice tone="warn">
          {a.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </Notice>
      )}
    </li>
  );
}

function ContextSheet({ open, onClose, value, onChange }) {
  const saved = useApi(open ? "/api/saved" : null);
  const shortlist = useApi(open ? "/api/shortlist" : null);
  const toggle = (key, id) => {
    const list = value[key];
    onChange({ ...value, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, 6) });
  };
  const opportunities = (saved.data?.items || []).filter((s) => s.opportunity);
  return (
    <Sheet open={open} onClose={onClose} title="What the advisor can see" footer={<Button onClick={onClose}>Done</Button>}>
      <p class="muted">Only what you choose here is sent with your question. Your name, email and notes are never included.</p>
      <Check checked={value.profile} onChange={(v) => onChange({ ...value, profile: v })}>
        My profile (grade, state, interests, goals, time and budget)
      </Check>
      <Check checked={value.experience} onChange={(v) => onChange({ ...value, experience: v })}>
        My activities list
      </Check>
      <div class="stack stack--sm">
        <p class="field__label">Saved opportunities (sent with their official sources)</p>
        {opportunities.length ? (
          opportunities.map((s) => (
            <Check key={s.id} checked={value.opportunityIds.includes(s.opportunity.id)} onChange={() => toggle("opportunityIds", s.opportunity.id)}>
              {s.title}
            </Check>
          ))
        ) : (
          <p class="small muted">Save opportunities in Explore to include them.</p>
        )}
      </div>
      <div class="stack stack--sm">
        <p class="field__label">Shortlisted colleges (official College Scorecard data)</p>
        {(shortlist.data?.items || []).length ? (
          shortlist.data.items.map((c) => (
            <Check key={c.id} checked={value.collegeIds.includes(c.id)} onChange={() => toggle("collegeIds", c.id)}>
              {c.name}
            </Check>
          ))
        ) : (
          <p class="small muted">Shortlist colleges to include them.</p>
        )}
      </div>
    </Sheet>
  );
}
