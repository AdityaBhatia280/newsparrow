// The run-through after onboarding: what Sparrow learned, then extracurriculars, colleges, this year's plan and the dock.
import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.js";
import { useTitle } from "../lib/hooks.js";
import { toast } from "../lib/store.js";
import { CollegeCard, OppCard } from "../ui/cards.jsx";
import { Icon, Mark } from "../ui/icons.jsx";
import { Button, Display, Glass, Notice, Tag } from "../ui/kit.jsx";
import { DOCK } from "../ui/shell.jsx";
import { Splash } from "./entry.jsx";

export function RunThrough({ data, onFinish }) {
  useTitle("Your plan");
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState(() => new Map(data.opportunities.filter((o) => o.saved).map((o) => [o.id, o.saved])));
  const [version, setVersion] = useState(0);
  const slides = ["you", "opportunities", "colleges", "plan", "dock"];
  const last = i === slides.length - 1;
  const go = (n) => setI(Math.max(0, Math.min(slides.length - 1, n)));

  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    addEventListener("keydown", key);
    window.scrollTo(0, 0);
    document.querySelector(".slide h1")?.focus({ preventScroll: true });
    return () => removeEventListener("keydown", key);
  }, [i]);

  const saveAll = async () => {
    const todo = data.opportunities.filter((o) => !saved.has(o.id));
    try {
      const results = await Promise.all(todo.map((o) => api.post("/api/saved", { opportunityId: o.id })));
      const next = new Map(saved);
      todo.forEach((o, n) => next.set(o.id, { id: results[n].id, status: results[n].status }));
      setSaved(next);
      setVersion((v) => v + 1);
      toast(todo.length ? `Saved ${todo.length} to your plan.` : "They're all in your plan already.", "ok");
    } catch (e) {
      toast(e.message, "bad");
    }
  };

  return (
    <div class="runthrough">
      <header class="wizard__bar">
        <span class="brand">
          <Mark />
          <span>sparrow</span>
        </span>
        <div class="dots" role="tablist" aria-label="Run-through progress">
          {slides.map((s, n) => (
            <button key={s} type="button" role="tab" aria-selected={String(n === i)} aria-label={`Part ${n + 1} of ${slides.length}`} class="dot" onClick={() => go(n)} />
          ))}
        </div>
        <button type="button" class="link-btn" onClick={onFinish}>
          Skip
        </button>
      </header>
      <main id="main" class="slide" key={i} tabIndex={-1}>
        {slides[i] === "you" && (
          <div class="slide__inner reveal">
            <p class="kicker">Your starting point</p>
            <Display pre="Here's what" accent="we" post="noticed" />
            <Glass pad="lg" class="stack slide__summary">
              <p class="lead" style={{ color: "#fff" }}>
                {data.summary}
              </p>
              {data.strengths?.length > 0 && (
                <div class="chips">
                  {data.strengths.map((s) => (
                    <Tag key={s} tone="blue" icon="star">
                      {s}
                    </Tag>
                  ))}
                </div>
              )}
              {data.nextSteps?.length > 0 && (
                <ul class="list-reset stack stack--sm">
                  {data.nextSteps.map((s) => (
                    <li key={s} class="row" style={{ gap: "10px", flexWrap: "nowrap" }}>
                      <Icon name="arrow-right" size={18} /> {s}
                    </li>
                  ))}
                </ul>
              )}
            </Glass>
            {data.aiError && (
              <Notice tone="warn">
                AI personalization didn't run: {data.aiError.message}{" "}
                {data.aiError.topUpUrl && (
                  <a href={data.aiError.topUpUrl} target="_blank" rel="noopener noreferrer">
                    Open publik
                  </a>
                )}{" "}
                Your plan below is still built from your answers.
              </Notice>
            )}
          </div>
        )}
        {slides[i] === "opportunities" && (
          <div class="slide__inner reveal">
            <p class="kicker">Picked for you</p>
            <Display pre="Extracurriculars" accent="for" post="you" />
            <div class="card-grid stagger">
              {data.opportunities.map((o) => (
                <OppCard
                  key={o.id + ":" + version}
                  item={{ ...o, saved: saved.get(o.id) || null }}
                  reason={o.reason}
                  onSaved={(s) =>
                    setSaved((map) => {
                      const next = new Map(map);
                      s ? next.set(o.id, { id: s.id, status: s.status }) : next.delete(o.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
            {data.opportunities.length > 0 && (
              <Button variant="quiet" icon="bookmark" onClick={saveAll}>
                Save all {data.opportunities.length}
              </Button>
            )}
          </div>
        )}
        {slides[i] === "colleges" && (
          <div class="slide__inner reveal">
            <p class="kicker">Official data, no guesswork</p>
            <Display pre="Colleges" accent="to" post="explore" />
            {data.colleges.length ? (
              <div class="card-grid stagger">
                {data.colleges.map((c) => (
                  <CollegeCard key={c.id} college={c} />
                ))}
              </div>
            ) : (
              <Notice>Explore Colleges any time to build your shortlist.</Notice>
            )}
            <p class="small muted">Figures from the U.S. Department of Education College Scorecard. Admission rates are averages, not your chances.</p>
          </div>
        )}
        {slides[i] === "plan" && (
          <div class="slide__inner reveal">
            <p class="kicker">Added to your plan</p>
            <Display pre="Your year," accent="step" post="by step" />
            <Glass pad="lg" class="stack">
              <ul class="list-reset stack stagger">
                {data.tasks.map((t) => (
                  <li key={t.id} class="plan-line">
                    <span class="plan-line__check" aria-hidden="true">
                      <Icon name="check" size={16} />
                    </span>
                    {t.title}
                  </li>
                ))}
              </ul>
              <p class="muted small">Find these in Plan, with a full grade-by-grade roadmap. Change or remove anything.</p>
            </Glass>
          </div>
        )}
        {slides[i] === "dock" && (
          <div class="slide__inner reveal">
            <p class="kicker">Getting around</p>
            <Display pre="Meet" accent="your" post="dock" />
            <div class="dock-explainer stagger">
              {DOCK.map((d) => (
                <Glass key={d.href} class="dock-explainer__item">
                  <span class="tile" aria-hidden="true">
                    <Icon name={d.icon} />
                  </span>
                  <div>
                    <strong>{d.label}</strong>
                    <p class="muted small">{DOCK_COPY[d.label]}</p>
                  </div>
                </Glass>
              ))}
            </div>
          </div>
        )}
      </main>
      <footer class="runthrough__foot">
        <Button variant="ghost" icon="arrow-left" onClick={() => go(i - 1)} disabled={i === 0}>
          Back
        </Button>
        <Button size="lg" iconRight={last ? "rocket" : "arrow-right"} onClick={last ? onFinish : () => go(i + 1)}>
          {last ? "Let's go" : "Next"}
        </Button>
      </footer>
    </div>
  );
}

const DOCK_COPY = {
  Home: "Today's tasks, deadlines and fresh matches.",
  Explore: "Programs, competitions, internships and scholarships.",
  Colleges: "Search, shortlist and compare with official data.",
  Plan: "Your applications board, tasks and calendar.",
  Advisor: "Ask for a plan, a comparison or draft feedback.",
};

/** /app/welcome: revisit the run-through any time (rebuilt from your answers, no AI). */
export function RunThroughAgain() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.post("/api/onboarding/complete", { useAi: false }).then(setData).catch((e) => toast(e.message, "bad"));
  }, []);
  if (!data) return <Splash />;
  return <RunThrough data={data} onFinish={() => history.back()} />;
}
