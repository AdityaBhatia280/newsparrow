import { useEffect, useState } from "preact/hooks";
import { COSTS, FORMATS, INTERESTS, OPPORTUNITY_TYPES, STATUSES } from "../../../shared/taxonomy.mjs";
import { api, query, uuid } from "../lib/api.js";
import { dayLabel, gradesLabel, label } from "../lib/format.js";
import { useApi, useDebounced, useTitle } from "../lib/hooks.js";
import { navigate, route, setQuery } from "../lib/router.js";
import { session, toast } from "../lib/store.js";
import { AiConsent, AiError } from "../ui/ai.jsx";
import { MatchTag, OppCard, VerifiedTag, costLabel } from "../ui/cards.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, Chip, Empty, ExternalLink, Glass, Notice, PageHead, PillSelect, SelectField, Sheet, Skeleton, Tag, TextField, TypeTile } from "../ui/kit.jsx";

const SORTS = [
  { id: "match", label: "Best match" },
  { id: "deadline", label: "Deadline" },
  { id: "title", label: "A to Z" },
  { id: "newest", label: "Recently checked" },
];

export function Explore() {
  useTitle("Explore");
  const q = route.value.query;
  const [text, setText] = useState(q.get("q") || "");
  const typed = useDebounced(text, 300);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState([]);
  const [discover, setDiscover] = useState(false);
  useEffect(() => {
    if ((q.get("q") || "") !== typed) setQuery({ q: typed });
  }, [typed]);
  const filters = {
    q: q.get("q") || "", type: q.get("type"), interest: q.get("interest"), grade: q.get("grade"), format: q.get("format"),
    cost: q.get("cost"), within: q.get("within"), matches: q.get("matches"), saved: q.get("saved"), sort: q.get("sort") || "match",
  };
  const path = "/api/opportunities" + query({ ...filters, offset });
  const { data, loading, error } = useApi(path);
  const key = JSON.stringify(filters);
  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [key]);
  useEffect(() => {
    if (!data) return;
    setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items.filter((i) => !prev.some((p) => p.id === i.id))]));
  }, [data]);
  const active = ["type", "interest", "grade", "format", "cost", "within", "matches", "saved"].some((k) => filters[k]) || filters.q;
  return (
    <div class="explore">
      <PageHead
        kicker="Explore"
        pre="Find your"
        accent="next"
        post="thing"
        lead="Real programs, competitions, internships and scholarships, ranked by how well they fit what you told Sparrow."
        actions={
          <>
            <Button icon="sparkles" onClick={() => setDiscover(true)}>
              Discover with AI
            </Button>
            <Button variant="ghost" icon="plus" href="/app/contribute">
              Suggest one
            </Button>
          </>
        }
      />
      <div class="filters">
        <div class="search-field">
          <Icon name="search" />
          <label class="visually-hidden" for="explore-search">
            Search opportunities
          </label>
          <input
            id="explore-search"
            class="input input--search"
            type="search"
            placeholder="Search robotics, writing, NASA…"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </div>
        <div class="filter-row">
          <Chip size="sm" icon="target" selected={!!filters.matches} onClick={() => setQuery({ matches: filters.matches ? null : 1 })}>
            Matches me
          </Chip>
          <Chip size="sm" icon="bookmark" selected={!!filters.saved} onClick={() => setQuery({ saved: filters.saved ? null : 1 })}>
            Saved
          </Chip>
          <PillSelect label="Type" allLabel="Any type" value={filters.type} options={OPPORTUNITY_TYPES} onChange={(v) => setQuery({ type: v })} />
          <PillSelect label="Interest" allLabel="Any interest" value={filters.interest} options={INTERESTS.filter((i) => i.id !== "exploring")} onChange={(v) => setQuery({ interest: v })} />
          <PillSelect label="Grade" allLabel="Any grade" value={filters.grade} options={[9, 10, 11, 12].map((g) => ({ id: String(g), label: `Grade ${g}` }))} onChange={(v) => setQuery({ grade: v })} />
          <PillSelect label="Format" allLabel="Any format" value={filters.format} options={FORMATS} onChange={(v) => setQuery({ format: v })} />
          <PillSelect label="Cost" allLabel="Any cost" value={filters.cost} options={COSTS.filter((c) => c.id !== "unknown")} onChange={(v) => setQuery({ cost: v })} />
          <PillSelect label="Sort" allLabel="Best match" value={filters.sort === "match" ? null : filters.sort} options={SORTS.slice(1)} onChange={(v) => setQuery({ sort: v })} />
        </div>
        <div class="row row--between">
          <p class="muted small" aria-live="polite">
            {data ? `${data.total} ${data.total === 1 ? "opportunity" : "opportunities"}` : " "}
          </p>
          {active && (
            <button
              type="button"
              class="link-btn"
              onClick={() => {
                setText("");
                navigate("/app/explore", { replace: true, scroll: false });
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {error && <Notice tone="bad">{error.message}</Notice>}
      {loading && !items.length ? (
        <Skeleton grid count={6} height={240} />
      ) : items.length ? (
        <>
          <div class="card-grid stagger">
            {items.map((o) => (
              <OppCard key={o.id} item={o} />
            ))}
          </div>
          {data?.nextOffset !== null && data?.nextOffset !== undefined && (
            <div class="row" style={{ justifyContent: "center" }}>
              <Button variant="quiet" loading={loading} onClick={() => setOffset(data.nextOffset)}>
                Show more
              </Button>
            </div>
          )}
        </>
      ) : (
        <Glass>
          <Empty title="Nothing matches yet" action={<Button icon="sparkles" onClick={() => setDiscover(true)}>Search the web with AI</Button>}>
            Try fewer filters, or let AI look beyond Sparrow's catalog.
          </Empty>
        </Glass>
      )}
      <Discover open={discover} onClose={() => setDiscover(false)} initial={filters.q} />
    </div>
  );
}

function Discover({ open, onClose, initial }) {
  const [q, setQ] = useState(initial || "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [done, setDone] = useState({});
  useEffect(() => {
    if (open && !q) {
      const interests = session.value?.profile?.grade ? `grade ${session.value.profile.grade}` : "";
      setQ(["summer programs", interests].filter(Boolean).join(" "));
    }
  }, [open]);
  const search = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post("/api/discover", { q, requestId: uuid(), confirmed: true });
      setResults(r.results);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const save = async (r) => {
    try {
      await api.post("/api/saved", { title: r.title, url: r.url, provider: r.site });
      setDone((d) => ({ ...d, [r.url]: "saved" }));
      toast("Saved to your plan as a personal item.", "ok");
    } catch (err) {
      toast(err.message, "bad");
    }
  };
  const suggest = async (r) => {
    try {
      const s = await api.post("/api/submissions", { url: r.url, title: r.title });
      onClose();
      navigate(`/app/contribute?focus=${s.id}`);
    } catch (err) {
      if (err.slug) navigate(`/app/explore/${err.slug}`);
      else toast(err.message, "bad");
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Discover with AI" wide>
      <p class="muted">Search the web for opportunities beyond Sparrow's catalog. Results come straight from the web, so check each official site.</p>
      <form class="stack" onSubmit={search}>
        <TextField label="What are you looking for?" value={q} onInput={setQ} max={160} placeholder="e.g. free summer engineering programs in Texas" />
        <AiConsent checked={consent} onChange={setConsent} what="your search" compact />
        <AiError error={error} />
        <div>
          <Button type="submit" icon="search" loading={busy} disabled={!consent || q.trim().length < 2}>
            Search the web
          </Button>
        </div>
      </form>
      {results && (
        <ul class="list-reset stack">
          {results.length === 0 && <Notice>No results. Try different words.</Notice>}
          {results.map((r) => (
            <li key={r.url}>
              <Glass class="discover-result">
                <div class="stack stack--sm">
                  <p class="small muted">{r.site}</p>
                  <h3 style={{ fontSize: "17px" }}>
                    <ExternalLink href={r.url}>{r.title}</ExternalLink>
                  </h3>
                  {r.snippet && <p class="muted small">{r.snippet}</p>}
                </div>
                <div class="row">
                  {r.catalogSlug ? (
                    <Button size="sm" variant="quiet" href={`/app/explore/${r.catalogSlug}`} icon="check">
                      Already in Sparrow
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="quiet" icon={done[r.url] ? "check" : "bookmark"} disabled={!!done[r.url]} onClick={() => save(r)}>
                        {done[r.url] ? "Saved" : "Save to my plan"}
                      </Button>
                      <Button size="sm" variant="ghost" icon="plus" onClick={() => suggest(r)}>
                        Suggest to Sparrow
                      </Button>
                    </>
                  )}
                </div>
              </Glass>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function Opportunity({ slug }) {
  const { data: o, loading, error, setData } = useApi(`/api/opportunities/${encodeURIComponent(slug)}`);
  useTitle(o?.title || "Opportunity");
  const [task, setTask] = useState("");
  if (loading && !o) return <Skeleton count={3} height={180} />;
  if (error) return <Glass><Empty icon="compass" title="We couldn't find that one" action={<Button href="/app/explore">Back to Explore</Button>}>{error.message}</Empty></Glass>;
  const saved = o.saved;
  const save = async () => {
    try {
      const s = await api.post("/api/saved", { opportunityId: o.id });
      setData({ ...o, saved: { id: s.id, status: s.status, note: s.note, personalDue: s.personalDue } });
      toast("Saved to your plan.", "ok");
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const update = async (patch) => {
    setData({ ...o, saved: { ...saved, ...patch } });
    try {
      await api.patch(`/api/saved/${saved.id}`, patch);
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const remove = async () => {
    try {
      await api.del(`/api/saved/${saved.id}`);
      setData({ ...o, saved: null });
      toast("Removed from your plan.");
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const addTask = async (e) => {
    e.preventDefault();
    if (!task.trim()) return;
    try {
      await api.post("/api/tasks", { title: task.trim(), savedId: saved.id });
      setTask("");
      toast("Task added to your plan.", "ok");
    } catch (err) {
      toast(err.message, "bad");
    }
  };
  const verified = !!o.factsVerifiedAt;
  const facts = [
    ["Format", label("format", o.format)],
    ["Where", o.location || "Check official site"],
    ["Who can apply", o.eligibility || gradesLabel(o.grades)],
    ["Cost", verified ? costLabel(o) : o.cost === "free" ? "Free (confirm on the official site)" : "Check official site"],
    ["Deadline", verified && o.deadline ? dayLabel(o.deadline, { year: true }) : o.deadlineNote || "Check official site"],
    ["Time commitment", o.timeCommitment || "Check official site"],
  ];
  return (
    <div class="detail">
      <a class="back-link" href="/app/explore">
        <Icon name="arrow-left" size={16} /> Explore
      </a>
      <Glass strong pad="lg" class="detail__hero reveal" data-type={o.type}>
        <TypeTile type={o.type} size="lg" />
        <div class="stack stack--sm">
          <p class="kicker">
            {label("type", o.type)} · {o.provider}
          </p>
          <h1 class="detail__title" tabIndex={-1}>
            {o.title}
          </h1>
          <div class="row" style={{ gap: "8px" }}>
            <MatchTag match={o.match} />
            <VerifiedTag item={o} />
          </div>
        </div>
      </Glass>
      <div class="detail__layout">
        <div class="stack stack--lg">
          <Glass pad="lg" class="stack">
            <h2 class="h-sub">About</h2>
            <p class="lead" style={{ color: "#fff" }}>
              {o.summary}
            </p>
          </Glass>
          {o.match?.reasons?.length > 0 && (
            <Glass pad="lg" class="stack">
              <h2 class="h-sub">Why it fits you</h2>
              <ul class="list-reset stack stack--sm">
                {o.match.reasons.map((r) => (
                  <li key={r} class="row" style={{ flexWrap: "nowrap" }}>
                    <Icon name="sparkles" size={18} style={{ color: "var(--sky)" }} /> {r}
                  </li>
                ))}
              </ul>
            </Glass>
          )}
          <Glass pad="lg" class="stack">
            <h2 class="h-sub">The details</h2>
            <dl class="facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {!verified && (
              <Notice icon="info">
                Sparrow links to the official site but hasn't verified this year's dates, costs or rules yet. Always confirm them on the official site before you
                apply.
              </Notice>
            )}
          </Glass>
          {o.evidence?.length > 0 && (
            <Glass pad="lg" class="stack">
              <h2 class="h-sub">From the official source</h2>
              <ul class="list-reset stack">
                {o.evidence.map((e, n) => (
                  <li key={n} class="quote">
                    <span class="quote__field">{e.field}</span>
                    <blockquote>"{e.excerpt}"</blockquote>
                  </li>
                ))}
              </ul>
              <p class="small muted">
                Checked {dayLabel(o.factsVerifiedAt.slice(0, 10), { year: true })} from <ExternalLink href={o.evidence[0].sourceUrl}>the official page</ExternalLink>.
              </p>
            </Glass>
          )}
          <p class="small">
            <a href={`/app/contribute?correction=${o.slug}`}>Something out of date? Suggest a correction</a>
          </p>
        </div>
        <aside class="detail__side">
          <Glass strong pad="lg" class="stack">
            <Button href={o.officialUrl} size="lg" block iconRight="arrow-up-right">
              Visit official site
            </Button>
            {saved ? (
              <>
                <SelectField label="Application status" value={saved.status} onChange={(v) => v && update({ status: v })} options={STATUSES} />
                <TextField label="My target date" type="date" value={saved.personalDue || ""} onInput={(v) => update({ personalDue: v || null })} hint="Your own date, separate from the official deadline." />
                <TextField label="Notes" multiline rows={3} value={saved.note || ""} max={2000} onInput={(v) => setData({ ...o, saved: { ...saved, note: v } })} onBlur={(e) => update({ note: e.currentTarget.value })} />
                <form class="row" style={{ flexWrap: "nowrap" }} onSubmit={addTask}>
                  <label class="visually-hidden" for="quick-task">
                    New task
                  </label>
                  <input id="quick-task" class="input" placeholder="Add a task…" value={task} onInput={(e) => setTask(e.currentTarget.value)} maxLength={200} />
                  <Button type="submit" variant="quiet" icon="plus" aria-label="Add task" />
                </form>
                <button type="button" class="link-btn link-btn--danger" onClick={remove}>
                  Remove from my plan
                </button>
              </>
            ) : (
              <Button variant="quiet" size="lg" block icon="bookmark" onClick={save}>
                Save to my plan
              </Button>
            )}
            <Button variant="ghost" block icon="sparkles" href={`/app/advisor?opportunity=${o.id}`}>
              Ask the advisor
            </Button>
            <Button
              variant="ghost"
              block
              icon="copy"
              onClick={() => navigator.clipboard?.writeText(location.href).then(() => toast("Link copied.", "ok"), () => toast("Copy the address from your browser.", "bad"))}
            >
              Copy link
            </Button>
          </Glass>
        </aside>
      </div>
      {o.similar?.length > 0 && (
        <section class="home__section">
          <div class="section-title">
            <h2>Similar opportunities</h2>
          </div>
          <div class="card-grid">
            {o.similar.map((s) => (
              <OppCard key={s.id} item={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
