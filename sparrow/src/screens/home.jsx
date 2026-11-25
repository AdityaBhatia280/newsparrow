import { useState } from "preact/hooks";
import { api } from "../lib/api.js";
import { dayLabel, greeting, plural, relativeDay } from "../lib/format.js";
import { useApi, useTitle } from "../lib/hooks.js";
import { navigate } from "../lib/router.js";
import { session, toast } from "../lib/store.js";
import { CollegeCard, OppCard } from "../ui/cards.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, Display, Empty, Glass, Skeleton, Tag } from "../ui/kit.jsx";

export function Home() {
  useTitle("Home");
  const { data, loading, setData } = useApi("/api/home");
  const [ask, setAsk] = useState("");
  const name = session.value?.user?.name;
  const toggleTask = async (task) => {
    setData((d) => ({ ...d, upNext: d.upNext.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) }));
    try {
      await api.patch(`/api/tasks/${task.id}`, { done: !task.done });
      if (!task.done) toast("Nice work. Task done.", "ok");
    } catch (e) {
      toast(e.message, "bad");
    }
  };
  const c = data?.counts;
  return (
    <div class="home">
      <section class="home__hero reveal">
        <p class="kicker">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <Display pre={greeting() + ","} accent={name || "friend"} size="md" />
        <form
          class="ask-bar glass"
          onSubmit={(e) => {
            e.preventDefault();
            navigate("/app/advisor" + (ask.trim() ? "?q=" + encodeURIComponent(ask.trim()) : ""));
          }}
        >
          <Icon name="sparkles" />
          <label class="visually-hidden" for="ask-input">
            Ask your advisor
          </label>
          <input id="ask-input" class="ask-bar__input" placeholder="Ask your advisor anything about your plan…" value={ask} onInput={(e) => setAsk(e.currentTarget.value)} maxLength={400} />
          <button type="submit" class="ask-bar__go" aria-label="Open the advisor">
            <Icon name="arrow-right" />
          </button>
        </form>
      </section>

      {loading && !data ? (
        <Skeleton count={3} height={160} />
      ) : (
        data && (
          <>
            <ul class="stat-row stagger list-reset" aria-label="Your progress">
              {[
                ["Saved", c.saved, "/app/plan", "bookmark"],
                ["Preparing", c.preparing, "/app/plan", "pencil"],
                ["Submitted", c.submitted, "/app/plan", "send"],
                ["Colleges", c.colleges, "/app/colleges?shortlisted=1", "graduation-cap"],
              ].map(([label, n, href, icon]) => (
                <li key={label}>
                  <a class="stat glass glass--interactive" href={href}>
                    <Icon name={icon} />
                    <strong>{n}</strong>
                    <span>{label}</span>
                  </a>
                </li>
              ))}
            </ul>

            <div class="home__grid">
              <Glass class="home__tasks" pad="lg">
                <div class="section-title">
                  <h2>Up next</h2>
                  <a href="/app/plan?view=tasks">All tasks</a>
                </div>
                {data.upNext.length ? (
                  <ul class="list-reset task-list">
                    {data.upNext.map((t) => {
                      const due = relativeDay(t.due);
                      return (
                        <li key={t.id} class={"task" + (t.done ? " task--done" : "")}>
                          <label class="check">
                            <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
                            <span>
                              <span class="task__title">{t.title}</span>
                              {t.savedTitle && <span class="task__for">{t.savedTitle}</span>}
                            </span>
                          </label>
                          {due && <Tag tone={due.tone || undefined}>{due.text}</Tag>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Empty icon="party" title="You're all caught up">
                    Save an opportunity or add a task to keep moving.
                  </Empty>
                )}
                {c.overdue > 0 && <p class="small" style={{ color: "#ffc2c9", marginTop: "12px" }}>{plural(c.overdue, "task")} overdue</p>}
              </Glass>

              <Glass class="home__dates" pad="lg">
                <div class="section-title">
                  <h2>Coming up</h2>
                  <a href="/app/plan?view=calendar">Calendar</a>
                </div>
                {data.deadlines.length ? (
                  <ol class="list-reset timeline">
                    {data.deadlines.map((d) => (
                      <li key={d.kind + d.ref + d.date} class="timeline__item">
                        <span class="timeline__date">{dayLabel(d.date)}</span>
                        <span>
                          {d.slug ? <a href={`/app/explore/${d.slug}`}>{d.title}</a> : d.title}
                          <span class="small muted"> · {d.kind === "deadline" ? "Deadline" : d.kind === "personal" ? "Your target date" : "Task"}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p class="muted">Add dates to saved opportunities and tasks to see the next six weeks here.</p>
                )}
              </Glass>
            </div>

            <section class="home__section">
              <div class="section-title">
                <h2>Picked for you</h2>
                <a href="/app/explore">Explore all</a>
              </div>
              {data.forYou.length ? (
                <div class="scroller">
                  {data.forYou.map((o) => (
                    <div class="scroller__item" key={o.id}>
                      <OppCard item={o} />
                    </div>
                  ))}
                </div>
              ) : (
                <Glass>
                  <Empty icon="compass" title="You've saved every match" action={<Button href="/app/explore">Explore more</Button>} />
                </Glass>
              )}
            </section>

            <div class="home__grid">
              <section class="home__section">
                <div class="section-title">
                  <h2>Your colleges</h2>
                  <a href="/app/colleges">Explore colleges</a>
                </div>
                {data.shortlist.length ? (
                  <div class="card-grid card-grid--2">
                    {data.shortlist.map((col) => (
                      <CollegeCard key={col.id} college={col} />
                    ))}
                  </div>
                ) : (
                  <Glass>
                    <Empty icon="graduation-cap" title="Start a shortlist" action={<Button href="/app/colleges">Find colleges</Button>}>
                      Official data on cost, size and outcomes for 1,700+ four-year colleges.
                    </Empty>
                  </Glass>
                )}
              </section>
              <Glass class="home__activities" pad="lg">
                <span class="tile tile--lg" aria-hidden="true">
                  <Icon name="medal" />
                </span>
                <h2>Your activities</h2>
                <p class="muted">
                  {c.activities
                    ? `${plural(c.activities, "item")} in your activities list. Keep descriptions sharp for applications.`
                    : "Build a Common App-style activities list, or import it from your resume."}
                </p>
                <Button variant="quiet" href="/app/profile" iconRight="arrow-right">
                  {c.activities ? "Open your list" : "Add activities"}
                </Button>
              </Glass>
            </div>
          </>
        )
      )}
    </div>
  );
}
