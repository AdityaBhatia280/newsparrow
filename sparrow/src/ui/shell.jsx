import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../lib/api.js";
import { initials } from "../lib/format.js";
import { navigate, route } from "../lib/router.js";
import { refreshSession, session, toast } from "../lib/store.js";
import { useWallet } from "./ai.jsx";
import { Icon, Mark } from "./icons.jsx";
import { Button, Glass, Ring } from "./kit.jsx";

export function Sky() {
  return (
    <div class="sky" aria-hidden="true">
      <i class="sky__blob sky__blob--1" />
      <i class="sky__blob sky__blob--2" />
      <i class="sky__blob sky__blob--3" />
      <i class="sky__stars" />
      <i class="sky__grain" />
    </div>
  );
}

export const DOCK = [
  { label: "Home", href: "/app", icon: "house" },
  { label: "Explore", href: "/app/explore", icon: "compass" },
  { label: "Colleges", href: "/app/colleges", icon: "graduation-cap" },
  { label: "Plan", href: "/app/plan", icon: "list-checks" },
  { label: "Advisor", href: "/app/advisor", icon: "sparkles" },
];

export function activeDock(path) {
  if (path === "/app" || path === "/app/welcome") return 0;
  return DOCK.findIndex((d, i) => i > 0 && (path === d.href || path.startsWith(d.href + "/")));
}

export function Dock() {
  const path = route.value.path;
  const active = activeDock(path);
  const nav = useRef(null);
  const items = useRef([]);
  const [lens, setLens] = useState(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = items.current[active];
      if (!el || !nav.current) return setLens(null);
      setLens({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const t = setTimeout(measure, 420); // after the label width transition
    addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      removeEventListener("resize", measure);
    };
  }, [active, compact]);

  useEffect(() => {
    let last = scrollY, ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY;
        if (y > 140 && y > last + 6) setCompact(true);
        else if (y < last - 6 || y < 80) setCompact(false);
        last = y;
        ticking = false;
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav class="dock" aria-label="Main" data-compact={String(compact)} id="dock" ref={nav}>
      {lens && <span class="dock__lens" style={{ transform: `translateX(${lens.x}px)`, width: lens.w + "px" }} aria-hidden="true" />}
      {DOCK.map((item, i) => (
        <a
          key={item.href}
          ref={(el) => (items.current[i] = el)}
          href={item.href}
          class="dock__item"
          data-dock={item.label.toLowerCase()}
          aria-current={i === active ? "page" : undefined}
        >
          <Icon name={item.icon} />
          <span class="dock__label">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

function Allowance() {
  const wallet = useWallet();
  if (!wallet?.reachable) return null;
  const left = wallet.remainingPercent ?? wallet.prepaidRemainingPercent;
  if (!Number.isFinite(left)) return null;
  return (
    <a class="allowance" href="/app/rewards" title="Your publik AI allowance">
      <Ring value={left} size={30} />
      <span>
        {left}% <span class="hide-sm">AI left</span>
      </span>
    </a>
  );
}

function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const user = session.value?.user || {};
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !wrap.current?.contains(e.target)) {
        setOpen(false);
        if (e.type === "keydown") wrap.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  useEffect(() => setOpen(false), [route.value.path]);
  const signOut = async () => {
    try {
      await api.post("/api/auth", { action: "sign_out" });
    } catch {}
    await refreshSession();
    navigate("/app", { replace: true });
  };
  const links = [
    ["Profile & activities", "/app/profile", "user"],
    ["Suggest an opportunity", "/app/contribute", "plus"],
    ["Rewards & AI usage", "/app/rewards", "trophy"],
    ["Settings", "/app/settings", "settings"],
    ...(user.isAdmin ? [["Reviewer tools", "/app/admin", "shield"]] : []),
  ];
  return (
    <div class="menu-wrap" ref={wrap}>
      <button type="button" class="avatar-btn" aria-haspopup="menu" aria-expanded={String(open)} aria-label="Account menu" onClick={() => setOpen(!open)}>
        <span class="avatar">{initials(user.name || user.email)}</span>
      </button>
      {open && (
        <Glass class="menu" strong pad={false} role="menu">
          <div class="menu__head">
            <strong>{user.name || "Your account"}</strong>
            <span>{user.email}</span>
          </div>
          {links.map(([text, href, icon]) => (
            <a key={href} href={href} role="menuitem">
              <Icon name={icon} />
              {text}
            </a>
          ))}
          <button type="button" role="menuitem" onClick={signOut}>
            <Icon name="log-out" />
            Sign out
          </button>
        </Glass>
      )}
    </div>
  );
}

export function TopBar() {
  return (
    <header class="topbar">
      <a class="brand" href="/app" aria-label="Sparrow home">
        <Mark />
        <span>sparrow</span>
      </a>
      <div class="topbar__right">
        <Allowance />
        <AvatarMenu />
      </div>
    </header>
  );
}

const TOUR = [
  { dock: "explore", title: "Explore", body: "Real programs, competitions, internships and scholarships, ranked by how well they fit you." },
  { dock: "colleges", title: "Colleges", body: "Official data on 1,700+ four-year colleges. Shortlist, compare and keep notes." },
  { dock: "plan", title: "Plan", body: "Track every application on a board, with tasks, dates and a calendar you can export." },
  { dock: "advisor", title: "Advisor", body: "Ask for a plan, a comparison or feedback on a draft. It uses only facts Sparrow can show you." },
];

/** A spotlight walk-through of the dock after the run-through. */
export function Tour({ onDone }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState(null);
  const s = TOUR[step];
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-dock="${s.dock}"]`);
      if (el) setBox(el.getBoundingClientRect());
    };
    measure();
    const t = setTimeout(measure, 450);
    addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      removeEventListener("resize", measure);
    };
  }, [step]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const finish = async () => {
    try {
      await api.patch("/api/profile", { tourDone: true });
    } catch {}
    onDone();
  };
  const next = () => (step < TOUR.length - 1 ? setStep(step + 1) : finish());
  return (
    <div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box && (
        <span
          class="tour__spot"
          style={{ left: box.left - 8 + "px", top: box.top - 8 + "px", width: box.width + 16 + "px", height: box.height + 16 + "px" }}
          aria-hidden="true"
        />
      )}
      <Glass class="tour__card" strong>
        <p class="kicker">
          {step + 1} of {TOUR.length}
        </p>
        <h2 id="tour-title">{s.title}</h2>
        <p>{s.body}</p>
        <div class="row row--between">
          <button type="button" class="link-btn" onClick={finish}>
            Skip tour
          </button>
          <Button onClick={next} iconRight={step < TOUR.length - 1 ? "arrow-right" : "check"} autoFocus>
            {step < TOUR.length - 1 ? "Next" : "Start exploring"}
          </Button>
        </div>
      </Glass>
    </div>
  );
}

export function useTourGate() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (route.value.query.get("tour") === "1" || session.value?.profile?.tourDone === false) setShow(true);
  }, []);
  const done = () => {
    setShow(false);
    if (session.value?.profile) session.value = { ...session.value, profile: { ...session.value.profile, tourDone: true } };
    if (route.value.query.get("tour")) navigate("/app", { replace: true, scroll: false });
    toast("You're all set. Have fun exploring.", "ok");
  };
  return [show, done];
}
