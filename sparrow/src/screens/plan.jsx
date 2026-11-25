import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GRADES, STATUSES, TERMS } from "../../../shared/taxonomy.mjs";
import { api } from "../lib/api.js";
import { dayLabel, isoDay, parseDay, relativeDay, today } from "../lib/format.js";
import { useApi, useTitle } from "../lib/hooks.js";
import { route, setQuery } from "../lib/router.js";
import { confirmAction, session, toast } from "../lib/store.js";
import { Icon } from "../ui/icons.jsx";
import { Button, Empty, ExternalLink, Glass, IconButton, PageHead, Segmented, SelectField, Sheet, Skeleton, Tag, TextField, TypeTile } from "../ui/kit.jsx";

const VIEWS = [
  { id: "board", label: "Board" },
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Calendar" },
  { id: "roadmap", label: "Roadmap" },
];

export function Plan() {
  useTitle("Plan");
  const view = route.value.query.get("view") || "board";
  const saved = useApi("/api/saved");
  const tasks = useApi("/api/tasks");
  const [openId, setOpenId] = useState(null);
  const reload = () => {
    saved.reload();
    tasks.reload();
  };
  return (
    <div class="plan">
      <PageHead
        kicker="Plan"
        pre="Your"
        accent="game"
        post="plan"
        lead="Every application, task and date in one place. Drag cards as you make progress."
        actions={<Segmented label="View" options={VIEWS} value={view} onChange={(v) => setQuery({ view: v === "board" ? null : v })} />}
      />
      {view === "board" && <Board saved={saved} onOpen={setOpenId} />}
      {view === "tasks" && <Tasks tasks={tasks} saved={saved.data?.items || []} />}
      {view === "calendar" && <Calendar tasks={tasks.data?.items || []} saved={saved.data?.items || []} />}
      {view === "roadmap" && <Roadmap onAdded={tasks.reload} />}
      <SavedSheet id={openId} items={saved.data?.items || []} onClose={() => setOpenId(null)} onChange={reload} />
    </div>
  );
}

function Board({ saved, onOpen }) {
  const { data, loading, setData } = saved;
  const [drag, setDrag] = useState(null);
  const start = useRef(null);
  if (loading && !data) return <Skeleton grid count={5} height={220} />;
  const items = data?.items || [];
  if (!items.length)
    return (
      <Glass>
        <Empty icon="kanban" title="Start with one possibility" action={<Button href="/app/explore">Find opportunities</Button>}>
          Save opportunities from Explore and they'll show up here, ready to track.
        </Empty>
      </Glass>
    );
  const move = async (item, status) => {
    if (item.status === status) return;
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, status } : i)) }));
    try {
      await api.patch(`/api/saved/${item.id}`, { status });
      if (status === "accepted") toast("Congratulations! 🎉", "ok");
    } catch (e) {
      toast(e.message, "bad");
      saved.reload();
    }
  };
  const down = (e, item) => {
    if (e.button !== 0 || e.target.closest("button, a, select, input")) return;
    start.current = { x: e.clientX, y: e.clientY, item, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moveP = (e) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < 6) return;
    s.moved = true;
    const col = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.dataset?.status)?.dataset.status;
    setDrag({ id: s.item.id, dx, dy, over: col || null });
  };
  const up = (e) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) {
      onOpen(s.item.id);
      return;
    }
    const over = drag?.over;
    setDrag(null);
    if (over) move(s.item, over);
  };
  return (
    <div class="board" role="list">
      {STATUSES.map((col) => {
        const list = items.filter((i) => i.status === col.id);
        return (
          <section key={col.id} class={"board__col glass" + (drag?.over === col.id ? " board__col--over" : "")} data-status={col.id} role="listitem" aria-label={col.label}>
            <header class="board__head">
              <h2>{col.label}</h2>
              <span class="tag">{list.length}</span>
            </header>
            <ul class="list-reset board__list">
              {list.map((item) => {
                const due = relativeDay(item.personalDue);
                const done = item.tasks.filter((t) => t.done).length;
                const dragging = drag?.id === item.id;
                return (
                  <li
                    key={item.id}
                    class={"board__card" + (dragging ? " board__card--drag" : "")}
                    style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(1.5deg)` } : undefined}
                    onPointerDown={(e) => down(e, item)}
                    onPointerMove={moveP}
                    onPointerUp={up}
                    onPointerCancel={() => {
                      start.current = null;
                      setDrag(null);
                    }}
                  >
                    <div class="row" style={{ gap: "10px", flexWrap: "nowrap", alignItems: "flex-start" }}>
                      {item.opportunity ? <TypeTile type={item.opportunity.type} size="sm" /> : <span class="tile tile--sm" aria-hidden="true"><Icon name="link" /></span>}
                      <div class="stack stack--sm" style={{ minWidth: 0 }}>
                        <button type="button" class="board__title" onClick={() => onOpen(item.id)}>
                          {item.title}
                        </button>
                        {item.provider && <span class="small muted">{item.provider}</span>}
                      </div>
                    </div>
                    <div class="row" style={{ gap: "6px" }}>
                      {due && <Tag tone={due.tone || undefined} icon="calendar">{due.text}</Tag>}
                      {item.tasks.length > 0 && <Tag icon="list-checks">{done}/{item.tasks.length}</Tag>}
                      {item.note && <Tag icon="pencil">Note</Tag>}
                    </div>
                    <label class="board__move">
                      <span class="visually-hidden">Move {item.title} to</span>
                      <select value={item.status} onChange={(e) => move(item, e.currentTarget.value)}>
                        {STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevron-down" size={14} />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SavedSheet({ id, items, onClose, onChange }) {
  const item = items.find((i) => i.id === id);
  const [draft, setDraft] = useState(null);
  const [task, setTask] = useState("");
  const [due, setDue] = useState("");
  useEffect(() => setDraft(item ? { ...item } : null), [id, item?.updatedAt, item?.tasks?.length]);
  if (!item || !draft) return <Sheet open={false} onClose={onClose} title="" />;
  const patch = async (p) => {
    setDraft({ ...draft, ...p });
    try {
      await api.patch(`/api/saved/${item.id}`, p);
      onChange();
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const addTask = async (e) => {
    e.preventDefault();
    if (!task.trim()) return;
    try {
      await api.post("/api/tasks", { title: task.trim(), due: due || null, savedId: item.id });
      setTask("");
      setDue("");
      onChange();
    } catch (err) {
      toast(err.message, "bad");
    }
  };
  const toggle = async (t) => {
    try {
      await api.patch(`/api/tasks/${t.id}`, { done: !t.done });
      onChange();
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const removeTask = async (t) => {
    try {
      await api.del(`/api/tasks/${t.id}`);
      onChange();
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const remove = async () => {
    if (!(await confirmAction({ title: "Remove from your plan?", body: "Its notes, date and tasks will be deleted too.", confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      await api.del(`/api/saved/${item.id}`);
      onClose();
      onChange();
      toast("Removed from your plan.");
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  return (
    <Sheet
      open={!!id}
      onClose={onClose}
      title={item.title}
      footer={
        <>
          <button type="button" class="link-btn link-btn--danger" onClick={remove} style={{ marginRight: "auto" }}>
            Remove from plan
          </button>
          {item.opportunity && (
            <Button variant="ghost" href={`/app/explore/${item.opportunity.slug}`} onClick={onClose}>
              View details
            </Button>
          )}
          {item.url && (
            <Button href={item.url} iconRight="arrow-up-right">
              Official site
            </Button>
          )}
        </>
      }
    >
      <SelectField label="Status" value={draft.status} options={STATUSES} onChange={(v) => v && patch({ status: v })} />
      <TextField label="My target date" type="date" value={draft.personalDue || ""} onInput={(v) => patch({ personalDue: v || null })} hint="Your own date. Confirm official deadlines on the official site." />
      <TextField label="Notes" multiline rows={3} max={2000} value={draft.note} onInput={(v) => setDraft({ ...draft, note: v })} onBlur={() => draft.note !== item.note && patch({ note: draft.note })} />
      <div class="stack stack--sm">
        <p class="field__label">Tasks</p>
        <ul class="list-reset task-list">
          {item.tasks.map((t) => (
            <li key={t.id} class={"task" + (t.done ? " task--done" : "")}>
              <label class="check">
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
                <span class="task__title">{t.title}</span>
              </label>
              {t.due && <Tag>{dayLabel(t.due)}</Tag>}
              <IconButton icon="trash" label={`Delete ${t.title}`} class="icon-btn--plain" onClick={() => removeTask(t)} />
            </li>
          ))}
        </ul>
        <form class="task-add" onSubmit={addTask}>
          <label class="visually-hidden" for="sheet-task">
            New task
          </label>
          <input id="sheet-task" class="input" placeholder="Add a next step…" value={task} onInput={(e) => setTask(e.currentTarget.value)} maxLength={200} />
          <label class="visually-hidden" for="sheet-task-due">
            Due date
          </label>
          <input id="sheet-task-due" class="input" type="date" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
          <Button type="submit" variant="quiet" icon="plus">
            Add
          </Button>
        </form>
      </div>
    </Sheet>
  );
}

function Tasks({ tasks, saved }) {
  const { data, loading, setData, reload } = tasks;
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [link, setLink] = useState(null);
  const [showDone, setShowDone] = useState(false);
  if (loading && !data) return <Skeleton count={3} height={90} />;
  const items = data?.items || [];
  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const t = await api.post("/api/tasks", { title: title.trim(), due: due || null, savedId: link || null });
      setData((d) => ({ ...d, items: [t, ...d.items] }));
      setTitle("");
      setDue("");
    } catch (err) {
      toast(err.message, "bad");
    }
  };
  const toggle = async (t) => {
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) }));
    try {
      await api.patch(`/api/tasks/${t.id}`, { done: !t.done });
    } catch (e) {
      toast(e.message, "bad");
      reload();
    }
  };
  const remove = async (t) => {
    setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== t.id) }));
    try {
      await api.del(`/api/tasks/${t.id}`);
    } catch (e) {
      toast(e.message, "bad");
      reload();
    }
  };
  const now = today();
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const open = items.filter((t) => !t.done);
  const groups = [
    ["Overdue", open.filter((t) => t.due && parseDay(t.due) < now)],
    ["This week", open.filter((t) => t.due && parseDay(t.due) >= now && parseDay(t.due) <= weekEnd)],
    ["Later", open.filter((t) => t.due && parseDay(t.due) > weekEnd)],
    ["Anytime", open.filter((t) => !t.due)],
  ].filter(([, list]) => list.length);
  const done = items.filter((t) => t.done);
  return (
    <div class="stack stack--lg">
      <Glass as="form" class="task-composer" onSubmit={add}>
        <label class="visually-hidden" for="new-task">
          New task
        </label>
        <input id="new-task" class="input" placeholder="What's your next step?" value={title} onInput={(e) => setTitle(e.currentTarget.value)} maxLength={200} />
        <label class="visually-hidden" for="new-task-due">
          Due date
        </label>
        <input id="new-task-due" class="input" type="date" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
        <label class="visually-hidden" for="new-task-link">
          For
        </label>
        <select id="new-task-link" class="select" value={link || ""} onChange={(e) => setLink(e.currentTarget.value || null)}>
          <option value="">Not linked</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <Button type="submit" icon="plus">
          Add task
        </Button>
      </Glass>
      {!open.length && !done.length && (
        <Glass>
          <Empty icon="list-checks" title="No tasks yet">Add one above, or open the Roadmap for ideas for your grade.</Empty>
        </Glass>
      )}
      {groups.map(([name, list]) => (
        <section key={name}>
          <div class="section-title">
            <h2>{name}</h2>
            <span class="muted small">{list.length}</span>
          </div>
          <Glass pad={false}>
            <ul class="list-reset task-list task-list--padded">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} onToggle={toggle} onRemove={remove} />
              ))}
            </ul>
          </Glass>
        </section>
      ))}
      {done.length > 0 && (
        <section>
          <button type="button" class="link-btn" onClick={() => setShowDone(!showDone)} aria-expanded={String(showDone)}>
            {showDone ? "Hide" : "Show"} {done.length} completed
          </button>
          {showDone && (
            <Glass pad={false} class="reveal" style={{ marginTop: "12px" }}>
              <ul class="list-reset task-list task-list--padded">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={toggle} onRemove={remove} />
                ))}
              </ul>
            </Glass>
          )}
        </section>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, onRemove }) {
  const due = relativeDay(task.due);
  return (
    <li class={"task" + (task.done ? " task--done" : "")}>
      <label class="check">
        <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} />
        <span>
          <span class="task__title">{task.title}</span>
          {task.savedTitle && <span class="task__for">{task.savedTitle}</span>}
        </span>
      </label>
      {due && !task.done && <Tag tone={due.tone || undefined}>{due.text}</Tag>}
      <IconButton icon="trash" label={`Delete ${task.title}`} class="icon-btn--plain" onClick={() => onRemove(task)} />
    </li>
  );
}

function Calendar({ tasks, saved }) {
  const [month, setMonth] = useState(() => {
    const t = today();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selected, setSelected] = useState(isoDay(today()));
  const events = useMemo(() => {
    const list = [];
    for (const t of tasks) if (t.due && !t.done) list.push({ date: t.due, title: t.title, kind: "task" });
    for (const s of saved) {
      if (s.personalDue) list.push({ date: s.personalDue, title: s.title, kind: "target" });
      if (s.opportunity?.deadline && s.opportunity.factsVerifiedAt) list.push({ date: s.opportunity.deadline, title: s.title, kind: "deadline" });
    }
    return list;
  }, [tasks, saved]);
  const byDay = useMemo(() => Map.groupBy(events, (e) => e.date), [events]);
  const first = new Date(month);
  const startOffset = first.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);
  const todayIso = isoDay(today());
  const list = byDay.get(selected) || [];
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div class="calendar-layout">
      <Glass pad="lg" class="calendar">
        <div class="row row--between">
          <h2 class="h-sub">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
          <div class="row" style={{ gap: "6px" }}>
            <IconButton icon="chevron-left" label="Previous month" onClick={() => shift(-1)} />
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                const t = today();
                setMonth(new Date(t.getFullYear(), t.getMonth(), 1));
                setSelected(todayIso);
              }}
            >
              Today
            </Button>
            <IconButton icon="chevron-right" label="Next month" onClick={() => shift(1)} />
          </div>
        </div>
        <div class="calendar__grid" role="grid" aria-label="Month">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span key={d} class="calendar__dow" role="columnheader">
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={"e" + i} class="calendar__cell calendar__cell--empty" />;
            const iso = isoDay(d);
            const ev = byDay.get(iso) || [];
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                class={"calendar__cell" + (iso === todayIso ? " is-today" : "") + (iso === selected ? " is-selected" : "")}
                aria-label={`${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}${ev.length ? `, ${ev.length} item${ev.length > 1 ? "s" : ""}` : ""}`}
                onClick={() => setSelected(iso)}
              >
                <span class="calendar__num">{d.getDate()}</span>
                <span class="calendar__dots" aria-hidden="true">
                  {ev.slice(0, 3).map((e, n) => (
                    <i key={n} data-kind={e.kind} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div class="row legend small muted">
          <span>
            <i data-kind="task" /> Task
          </span>
          <span>
            <i data-kind="target" /> Your target date
          </span>
          <span>
            <i data-kind="deadline" /> Verified deadline
          </span>
        </div>
      </Glass>
      <div class="stack">
        <Glass pad="lg" class="stack">
          <h2 class="h-sub">{dayLabel(selected, { year: true })}</h2>
          {list.length ? (
            <ul class="list-reset stack stack--sm">
              {list.map((e, n) => (
                <li key={n} class="row" style={{ flexWrap: "nowrap" }}>
                  <i class="legend-dot" data-kind={e.kind} aria-hidden="true" />
                  <span>
                    {e.title} <span class="small muted">· {e.kind === "task" ? "Task" : e.kind === "target" ? "Your target date" : "Deadline"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">Nothing on this day.</p>
          )}
        </Glass>
        <Glass pad="lg" class="stack">
          <h2 class="h-sub">Add to your calendar</h2>
          <p class="muted small">Download your tasks and dates as a calendar file for Google Calendar, Apple Calendar or Outlook.</p>
          <a class="btn btn--quiet" href="/api/calendar.ics" download="sparrow-plan.ics" data-native>
            <Icon name="download" /> Export .ics
          </a>
        </Glass>
      </div>
    </div>
  );
}

function Roadmap({ onAdded }) {
  const { data, loading, setData } = useApi("/api/roadmap");
  const [grade, setGrade] = useState(() => String(session.value?.profile?.grade || 9));
  if (loading && !data) return <Skeleton count={3} height={180} />;
  const year = data.roadmap[grade];
  const add = async (term, index) => {
    const key = `roadmap:${grade}:${term}:${index}`;
    try {
      await api.post("/api/tasks", { title: "roadmap", planKey: key });
      setData((d) => ({ ...d, added: { ...d.added, [key]: { done: false } } }));
      onAdded();
      toast("Added to your tasks.", "ok");
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  return (
    <div class="stack stack--lg">
      <Segmented label="Grade" options={GRADES.map((g) => ({ id: String(g), label: `Grade ${g}` }))} value={grade} onChange={setGrade} />
      <Glass strong pad="lg" class="roadmap__head reveal" key={grade}>
        <p class="kicker">Grade {grade}</p>
        <h2 class="display display--md" style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>
          {year.title}
        </h2>
        <p class="muted">General guidance for the year. Always confirm dates with your school and each official source.</p>
      </Glass>
      <div class="roadmap stagger" key={"t" + grade}>
        {TERMS.map((term) => (
          <Glass key={term.id} pad="lg" class="stack">
            <div class="row" style={{ gap: "10px" }}>
              <span class="tile tile--sm" aria-hidden="true">
                <Icon name={term.id === "fall" ? "leaf" : term.id === "spring" ? "sparkles" : "star"} />
              </span>
              <h3 class="h-sub">{term.label}</h3>
            </div>
            <ul class="list-reset stack">
              {year.terms[term.id].map((text, i) => {
                const added = data.added[`roadmap:${grade}:${term.id}:${i}`];
                return (
                  <li key={i} class="roadmap__item">
                    <span>{text}</span>
                    {added ? (
                      <Tag tone="ok" icon="check">
                        {added.done ? "Done" : "Added"}
                      </Tag>
                    ) : (
                      <Button size="sm" variant="quiet" icon="plus" onClick={() => add(term.id, i)}>
                        Add
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Glass>
        ))}
      </div>
    </div>
  );
}
