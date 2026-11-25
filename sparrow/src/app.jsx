import { useEffect } from "preact/hooks";
import { match, route } from "./lib/router.js";
import { session } from "./lib/store.js";
import { ConfirmHost, Toasts } from "./ui/kit.jsx";
import { Dock, Sky, TopBar, Tour, useTourGate } from "./ui/shell.jsx";
import { Admin } from "./screens/admin.jsx";
import { Advisor } from "./screens/advisor.jsx";
import { College, Colleges, Compare } from "./screens/colleges.jsx";
import { Contribute, Rewards } from "./screens/contribute.jsx";
import { PublikGate, SignIn, Splash, Unavailable } from "./screens/entry.jsx";
import { Explore, Opportunity } from "./screens/explore.jsx";
import { Home } from "./screens/home.jsx";
import { NotFound } from "./screens/notfound.jsx";
import { Onboarding } from "./screens/onboarding.jsx";
import { Plan } from "./screens/plan.jsx";
import { Profile } from "./screens/profile.jsx";
import { RunThroughAgain } from "./screens/runthrough.jsx";
import { Settings } from "./screens/settings.jsx";

const ROUTES = [
  ["/app", () => <Home />],
  ["/app/explore", () => <Explore />],
  ["/app/explore/:slug", (p) => <Opportunity key={p.slug} slug={p.slug} />],
  ["/app/colleges", () => <Colleges />],
  ["/app/colleges/compare", () => <Compare />],
  ["/app/colleges/:id", (p) => <College key={p.id} id={p.id} />],
  ["/app/plan", () => <Plan />],
  ["/app/advisor", () => <Advisor />],
  ["/app/profile", () => <Profile />],
  ["/app/contribute", () => <Contribute />],
  ["/app/rewards", () => <Rewards />],
  ["/app/settings", () => <Settings />],
  ["/app/admin", () => <Admin />],
];

function Workspace() {
  const path = route.value.path;
  const [tour, endTour] = useTourGate();
  useEffect(() => {
    // Move focus to the new page's heading for screen readers and keyboard users.
    const t = setTimeout(() => document.querySelector("#main h1")?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [path]);
  if (path === "/app/welcome") return <RunThroughAgain />;
  let screen = <NotFound />;
  for (const [pattern, render] of ROUTES) {
    const params = match(pattern, path);
    if (params) {
      screen = render(params);
      break;
    }
  }
  return (
    <>
      <a class="skip-link" href="#main" data-native onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
        Skip to content
      </a>
      <TopBar />
      <main id="main" class="page" tabIndex={-1}>
        {screen}
      </main>
      <Dock />
      {tour && <Tour onDone={endTour} />}
    </>
  );
}

export function App() {
  const s = session.value;
  let body;
  if (!s) body = <Splash />;
  else if (s.offline) body = <Unavailable offline />;
  else if (!s.configured) body = <Unavailable />;
  else if (!s.authenticated) body = <SignIn />;
  else if (s.publik?.state !== "claimed") body = <PublikGate key={s.publik?.state} />;
  else if (!s.profile?.onboarded) body = <Onboarding />;
  else body = <Workspace />;
  return (
    <>
      <Sky />
      {body}
      <Toasts />
      <ConfirmHost />
    </>
  );
}
