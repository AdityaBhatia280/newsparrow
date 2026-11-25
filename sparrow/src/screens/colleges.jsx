import { useEffect, useState } from "preact/hooks";
import { COLLEGE_TAGS, STATES } from "../../../shared/taxonomy.mjs";
import { api, query } from "../lib/api.js";
import { collegeMonogram, count, dayLabel, money, percent, place } from "../lib/format.js";
import { useApi, useDebounced, useTitle } from "../lib/hooks.js";
import { navigate, route, setQuery } from "../lib/router.js";
import { toast } from "../lib/store.js";
import { CollegeCard, ShortlistButton, controlLabel, sizeLabel } from "../ui/cards.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, Chip, Empty, ExternalLink, Glass, Notice, PageHead, PillSelect, Segmented, Skeleton, Tag, TextField } from "../ui/kit.jsx";

const COMPARE_KEY = "sparrow.compare";
const readCompare = () => {
  try {
    return JSON.parse(sessionStorage.getItem(COMPARE_KEY) || "[]").slice(0, 4);
  } catch {
    return [];
  }
};
const writeCompare = (ids) => {
  try {
    sessionStorage.setItem(COMPARE_KEY, JSON.stringify(ids));
  } catch {}
};

export function Colleges() {
  useTitle("Colleges");
  const q = route.value.query;
  const [text, setText] = useState(q.get("q") || "");
  const typed = useDebounced(text, 300);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState([]);
  const [compare, setCompare] = useState(readCompare);
  useEffect(() => {
    if ((q.get("q") || "") !== typed) setQuery({ q: typed });
  }, [typed]);
  const filters = { q: q.get("q") || "", state: q.get("state"), size: q.get("size"), control: q.get("control"), maxNet: q.get("maxNet"), shortlisted: q.get("shortlisted"), sort: q.get("sort") || "match" };
  const { data, loading, error } = useApi("/api/colleges" + query({ ...filters, offset }));
  const key = JSON.stringify(filters);
  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [key]);
  useEffect(() => {
    if (data) setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items.filter((i) => !prev.some((p) => p.id === i.id))]));
  }, [data]);
  const toggleCompare = (id) =>
    setCompare((current) => {
      if (!current.includes(id) && current.length >= 4) {
        setTimeout(() => toast("Compare up to four colleges at a time.", "bad"));
        return current;
      }
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      writeCompare(next);
      return next;
    });
  return (
    <div class="colleges">
      <PageHead
        kicker="College Explorer"
        pre="Colleges"
        accent="worth"
        post="a look"
        lead={`${data?.source?.total ? count(data.source.total) : "1,700+"} four-year colleges with official cost, size and outcome data from the U.S. Department of Education.`}
      />
      <div class="filters">
        <div class="search-field">
          <Icon name="search" />
          <label class="visually-hidden" for="college-search">
            Search colleges
          </label>
          <input id="college-search" class="input input--search" type="search" placeholder="Search by name or city" value={text} onInput={(e) => setText(e.currentTarget.value)} />
        </div>
        <div class="filter-row">
          <Chip size="sm" icon="bookmark" selected={!!filters.shortlisted} onClick={() => setQuery({ shortlisted: filters.shortlisted ? null : 1 })}>
            My shortlist
          </Chip>
          <PillSelect label="State" allLabel="Any state" value={filters.state} options={STATES.map(([id, name]) => ({ id, label: name }))} onChange={(v) => setQuery({ state: v })} />
          <PillSelect
            label="Size"
            allLabel="Any size"
            value={filters.size}
            options={[
              { id: "small", label: "Small (under 5,000)" },
              { id: "medium", label: "Medium (5,000–15,000)" },
              { id: "large", label: "Large (15,000+)" },
            ]}
            onChange={(v) => setQuery({ size: v })}
          />
          <PillSelect label="Type" allLabel="Public or private" value={filters.control} options={[{ id: "public", label: "Public" }, { id: "private", label: "Private nonprofit" }]} onChange={(v) => setQuery({ control: v })} />
          <PillSelect
            label="Net price"
            allLabel="Any net price"
            value={filters.maxNet}
            options={[15000, 20000, 25000, 35000].map((n) => ({ id: String(n), label: `Under ${money(n)}/yr` }))}
            onChange={(v) => setQuery({ maxNet: v })}
          />
          <PillSelect
            label="Sort"
            allLabel="Best fit"
            value={filters.sort === "match" ? null : filters.sort}
            options={[
              { id: "name", label: "Name" },
              { id: "net_price", label: "Lowest net price" },
              { id: "size", label: "Largest" },
            ]}
            onChange={(v) => setQuery({ sort: v })}
          />
        </div>
        <p class="muted small" aria-live="polite">
          {data ? `${count(data.total)} colleges` : " "}
        </p>
      </div>
      {error && <Notice tone="bad">{error.message}</Notice>}
      {loading && !items.length ? (
        <Skeleton grid count={6} height={260} />
      ) : items.length ? (
        <>
          <div class="card-grid stagger">
            {items.map((c) => (
              <CollegeCard
                key={c.id}
                college={c}
                compare={
                  <label class="compare-toggle" title="Compare">
                    <input type="checkbox" checked={compare.includes(c.id)} onChange={() => toggleCompare(c.id)} />
                    <span class="visually-hidden">Compare {c.name}</span>
                    <Icon name="grid" size={17} />
                  </label>
                }
              />
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
          <Empty icon="graduation-cap" title={filters.shortlisted ? "Your shortlist is empty" : "No colleges match"}>
            {filters.shortlisted ? "Tap the bookmark on any college to add it." : "Try a different search or fewer filters."}
          </Empty>
        </Glass>
      )}
      <p class="source-line small muted">
        Source: <ExternalLink href="https://collegescorecard.ed.gov/">U.S. Department of Education College Scorecard</ExternalLink>
        {data?.source?.retrieved ? `, retrieved ${dayLabel(data.source.retrieved, { year: true })}` : ""}. Admission rates are averages for all applicants, not your
        chances.
      </p>
      {compare.length > 0 && (
        <div class="compare-tray glass glass--strong" role="region" aria-label="Compare colleges">
          <span>
            <strong>{compare.length}</strong> selected
          </span>
          <Button size="sm" iconRight="arrow-right" disabled={compare.length < 2} onClick={() => navigate(`/app/colleges/compare?ids=${compare.join(",")}`)}>
            Compare
          </Button>
          <button
            type="button"
            class="link-btn"
            onClick={() => {
              setCompare([]);
              writeCompare([]);
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export function College({ id }) {
  const { data: c, loading, error, setData } = useApi(`/api/colleges/${id}`);
  useTitle(c?.name || "College");
  const [note, setNote] = useState(null);
  useEffect(() => setNote(c?.shortlist?.note ?? null), [c?.id]);
  if (loading && !c) return <Skeleton count={3} height={180} />;
  if (error) return <Glass><Empty icon="graduation-cap" title="College not found" action={<Button href="/app/colleges">Back to colleges</Button>}>{error.message}</Empty></Glass>;
  const saveShortlist = async (patch) => {
    try {
      const updated = await api.put(`/api/shortlist/${c.id}`, patch);
      setData({ ...c, shortlist: updated.shortlist });
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const stats = [
    ["Undergraduates", count(c.size), "users"],
    ["Admitted (published rate)", percent(c.admissionRate), "target"],
    ["Average net price / year", money(c.netPrice), "wallet"],
    ["Graduate within 6 years", percent(c.completionRate), "graduation-cap"],
    ["Tuition, in state", money(c.tuitionIn), "landmark"],
    ["Tuition, out of state", money(c.tuitionOut), "globe"],
    ["Median earnings, 10 yrs after entry", money(c.medianEarnings), "briefcase"],
  ];
  return (
    <div class="detail">
      <a class="back-link" href="/app/colleges">
        <Icon name="arrow-left" size={16} /> Colleges
      </a>
      <Glass strong pad="lg" class="detail__hero reveal">
        <span class="monogram monogram--lg" aria-hidden="true">
          {collegeMonogram(c.name)}
        </span>
        <div class="stack stack--sm">
          <p class="kicker">
            {controlLabel(c.ownership)} · {place(c.city, c.state)}
          </p>
          <h1 class="detail__title" tabIndex={-1}>
            {c.name}
          </h1>
          <div class="row" style={{ gap: "8px" }}>
            {sizeLabel(c.size) && <Tag>{sizeLabel(c.size)} campus</Tag>}
            {c.match?.reasons?.[0] && (
              <Tag tone="blue" icon="sparkles">
                {c.match.reasons[0]}
              </Tag>
            )}
          </div>
        </div>
      </Glass>
      <div class="detail__layout">
        <div class="stack stack--lg">
          <div class="stat-grid stagger">
            {stats.map(([k, v, icon]) => (
              <Glass key={k} class="stat-tile">
                <Icon name={icon} />
                <strong>{v}</strong>
                <span>{k}</span>
              </Glass>
            ))}
          </div>
          {c.programs?.length > 0 && (
            <Glass pad="lg" class="stack">
              <h2 class="h-sub">Biggest areas of study</h2>
              <ul class="list-reset bars">
                {c.programs.map((p) => (
                  <li key={p.key} class="bar">
                    <span class="bar__label">{p.label}</span>
                    <span class="bar__track" aria-hidden="true">
                      <span class="bar__fill" style={{ width: `${Math.max(3, (p.share / c.programs[0].share) * 100)}%` }} />
                    </span>
                    <span class="bar__value">{Math.round(p.share * 100)}%</span>
                  </li>
                ))}
              </ul>
              <p class="small muted">Share of bachelor's degrees awarded in each field.</p>
            </Glass>
          )}
          <Glass pad="lg" class="stack">
            <h2 class="h-sub">Questions to research</h2>
            <ul class="list-reset stack stack--sm">
              {[
                "Which programs connect with your interests, and how do you get into them?",
                "What does the net price calculator estimate for your family?",
                "Which deadlines, tests and essays does this college ask for this year?",
                "What would a normal week of student life look like for you?",
              ].map((t) => (
                <li key={t} class="row" style={{ flexWrap: "nowrap" }}>
                  <Icon name="lightbulb" size={18} style={{ color: "var(--sky)", flex: "none" }} /> {t}
                </li>
              ))}
            </ul>
          </Glass>
          <p class="source-line small muted">
            Data: <ExternalLink href={c.scorecardUrl}>College Scorecard profile</ExternalLink>, U.S. Department of Education
            {c.sourceRetrievedAt ? ` (retrieved ${dayLabel(c.sourceRetrievedAt, { year: true })})` : ""}. Admission rates are averages, not your chances.
          </p>
        </div>
        <aside class="detail__side">
          <Glass strong pad="lg" class="stack">
            {c.url && (
              <Button href={c.url} size="lg" block iconRight="arrow-up-right">
                Official website
              </Button>
            )}
            {c.priceCalculatorUrl && (
              <Button href={c.priceCalculatorUrl} variant="quiet" block icon="wallet">
                Net price calculator
              </Button>
            )}
            <div class="row row--between">
              <strong>{c.shortlist ? "On your shortlist" : "Add to your shortlist"}</strong>
              <ShortlistButton college={c} onChange={(s) => setData({ ...c, shortlist: s })} />
            </div>
            {c.shortlist && (
              <>
                <Segmented label="Your label" options={COLLEGE_TAGS} value={c.shortlist.tag} onChange={(tag) => saveShortlist({ tag })} />
                <TextField
                  label="Your notes"
                  multiline
                  rows={4}
                  max={2000}
                  value={note ?? ""}
                  onInput={setNote}
                  onBlur={() => note !== c.shortlist.note && saveShortlist({ note: note ?? "" })}
                  placeholder="Questions, programs, visit plans…"
                />
              </>
            )}
            <Button variant="ghost" block icon="sparkles" href={`/app/advisor?college=${c.id}`}>
              Ask the advisor
            </Button>
          </Glass>
        </aside>
      </div>
    </div>
  );
}

export function Compare() {
  useTitle("Compare colleges");
  const ids = (route.value.query.get("ids") || "").split(",").map(Number).filter(Boolean).slice(0, 4);
  const [cols, setCols] = useState(null);
  useEffect(() => {
    Promise.all(ids.map((i) => api.get(`/api/colleges/${i}`).catch(() => null))).then((r) => setCols(r.filter(Boolean)));
  }, [ids.join(",")]);
  if (!cols) return <Skeleton count={2} height={240} />;
  const remove = (id) => {
    const next = ids.filter((x) => x !== id);
    writeCompare(next);
    navigate(next.length ? `/app/colleges/compare?ids=${next.join(",")}` : "/app/colleges", { replace: true });
  };
  const rows = [
    ["Location", (c) => place(c.city, c.state)],
    ["Type", (c) => controlLabel(c.ownership)],
    ["Undergraduates", (c) => count(c.size)],
    ["Admitted (published)", (c) => percent(c.admissionRate)],
    ["Avg net price / yr", (c) => money(c.netPrice)],
    ["Tuition in state", (c) => money(c.tuitionIn)],
    ["Tuition out of state", (c) => money(c.tuitionOut)],
    ["Graduate in 6 yrs", (c) => percent(c.completionRate)],
    ["Median earnings (10 yrs)", (c) => money(c.medianEarnings)],
    ["Top programs", (c) => c.programs.slice(0, 3).map((p) => p.label).join(", ")],
  ];
  return (
    <div class="compare">
      <a class="back-link" href="/app/colleges">
        <Icon name="arrow-left" size={16} /> Colleges
      </a>
      <PageHead kicker="Compare" pre="Side" accent="by" post="side" lead="Official figures from the College Scorecard. Use the net price calculators for your own estimate." />
      {cols.length < 2 ? (
        <Notice>Pick at least two colleges to compare.</Notice>
      ) : (
        <Glass pad={false} class="compare__wrap">
          <table class="compare__table">
            <thead>
              <tr>
                <th scope="col">
                  <span class="visually-hidden">Measure</span>
                </th>
                {cols.map((c) => (
                  <th key={c.id} scope="col">
                    <a href={`/app/colleges/${c.id}`}>{c.name}</a>
                    <button type="button" class="link-btn small" onClick={() => remove(c.id)}>
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {cols.map((c) => (
                    <td key={c.id}>{value(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}
      {cols.length >= 2 && (
        <Button icon="sparkles" href={`/app/advisor?colleges=${cols.map((c) => c.id).join(",")}&task=compare`}>
          Ask the advisor to compare
        </Button>
      )}
    </div>
  );
}
