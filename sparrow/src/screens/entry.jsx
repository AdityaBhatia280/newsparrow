// Before the workspace: Google sign-in, the required "Sign in with publik" gate, and the unavailable state.
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../lib/api.js";
import { useTitle } from "../lib/hooks.js";
import { refreshSession, session } from "../lib/store.js";
import { GoogleG, Icon, Mark } from "../ui/icons.jsx";
import { Button, Check, Display, Glass, Notice } from "../ui/kit.jsx";

function EntryFrame({ children, aside }) {
  return (
    <div class="entry">
      <header class="entry__bar">
        <a class="brand" href="/" data-native>
          <Mark />
          <span>sparrow</span>
        </a>
      </header>
      <main id="main" class="entry__main" tabIndex={-1}>
        <section class="entry__copy reveal">{aside}</section>
        <section class="entry__card reveal" style={{ animationDelay: "0.08s" }}>
          {children}
        </section>
      </main>
    </div>
  );
}

export function SignIn() {
  useTitle("Sign in");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => (new URLSearchParams(location.search).has("auth") ? "Sign-in didn't finish. Please try again." : ""));
  const needConsent = () => {
    if (consent) return true;
    setError("Check the box to confirm you're 13 or older and agree to the Terms and Privacy Policy.");
    return false;
  };
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const google = () =>
    needConsent() &&
    run(async () => {
      const r = await api.post("/api/auth", { action: "google", consent: true });
      location.assign(r.url);
    });
  return (
    <EntryFrame
      aside={
        <>
          <p class="kicker">For high school students</p>
          <Display as="p" pre="Your next" accent="big" post="step starts here" size="md" />
          <p class="lead">Extracurriculars that fit you, real data on 1,700+ colleges, and a plan that keeps every application moving.</p>
          <ul class="entry__points">
            <li>
              <Icon name="compass" /> Opportunities matched to your interests
            </li>
            <li>
              <Icon name="graduation-cap" /> Colleges with official cost and outcome data
            </li>
            <li>
              <Icon name="sparkles" /> An AI advisor that sticks to the facts
            </li>
          </ul>
        </>
      }
    >
      <Glass strong pad="lg" class="stack">
        <div class="stack stack--sm">
          <h1 class="entry__title" tabIndex={-1}>
            Sign in to Sparrow
          </h1>
          <p class="muted">New here? Signing in creates your account.</p>
        </div>
        <Check checked={consent} onChange={setConsent}>
          I'm 13 or older and I agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener">
            Privacy Policy
          </a>
          .
        </Check>
        <Button variant="haze" size="lg" block onClick={google} loading={busy}>
          <GoogleG /> Continue with Google
        </Button>
        <p class="small muted">Sparrow uses your Google account to sign you in. If your school account says it's blocked, use a personal Google account.</p>
        <p class="error-text" role="alert" aria-live="assertive">
          {error}
        </p>
      </Glass>
    </EntryFrame>
  );
}

/** "Sign in with publik": the first page after Sparrow's own sign-in. Same behavior as publik's gatePage(). */
export function PublikGate() {
  useTitle("Sign in with publik");
  const state = session.value?.publik || {};
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState("");
  const [claimUrl, setClaimUrl] = useState(state.claimUrl || null);
  const timer = useRef(null);

  useEffect(() => {
    if (!claimUrl && state.state !== "unreachable") refreshSession().then((s) => setClaimUrl(s?.publik?.claimUrl || null));
    return () => clearTimeout(timer.current);
  }, []);

  const href = claimUrl ? claimUrl + (claimUrl.includes("?") ? "&" : "?") + "return_to=" + encodeURIComponent(location.origin + "/app") : null;

  const start = () => {
    setWaiting(true);
    setNote("Waiting for you to sign in on the publik page.");
    const end = Date.now() + 10 * 60_000;
    const tick = async () => {
      const r = await api.get("/api/publik/status").catch(() => null);
      if (r?.state === "claimed") {
        await refreshSession();
        return;
      }
      if (Date.now() < end) timer.current = setTimeout(tick, 3000);
      else {
        setWaiting(false);
        setNote("No sign-in after 10 minutes. Click Sign in with publik to try again.");
      }
    };
    clearTimeout(timer.current);
    timer.current = setTimeout(tick, 3000);
  };

  const signOut = async () => {
    await api.post("/api/auth", { action: "sign_out" }).catch(() => {});
    await refreshSession();
  };

  return (
    <EntryFrame
      aside={
        <>
          <p class="kicker">One more step</p>
          <Display as="p" pre="Power up" accent="your" post="plan" size="md" />
          <p class="lead">
            Sparrow's AI runs on publik. Sign in or create a publik account once, and your resume analysis, matches and advisor all work under your own
            account.
          </p>
          <ul class="entry__points">
            <li>
              <Icon name="lock" /> Your publik key stays on Sparrow's server, never in the browser
            </li>
            <li>
              <Icon name="shield" /> Sparrow never sees your publik password
            </li>
            <li>
              <Icon name="sliders" /> AI only runs when you ask for it
            </li>
          </ul>
        </>
      }
    >
      <Glass strong pad="lg" class="stack">
        <div class="publik-badge" aria-hidden="true">
          p
        </div>
        <h1 class="entry__title" tabIndex={-1}>
          Sign in with publik
        </h1>
        {state.state === "unreachable" ? (
          <>
            <Notice tone="warn">{state.message || "publik is not reachable. Check your connection."}</Notice>
            <Button size="lg" block icon="refresh" onClick={() => location.reload()}>
              Retry
            </Button>
          </>
        ) : (
          <>
            <p>This app uses your publik account. Click Sign in with publik, then sign in on the publik page. This page continues when you are signed in.</p>
            {href ? (
              <Button href={href} size="lg" block iconRight="arrow-up-right" onClick={start}>
                Sign in with publik
              </Button>
            ) : (
              <Button size="lg" block loading>
                Preparing your publik sign-in
              </Button>
            )}
            {waiting && (
              <div class="row" role="status">
                <span class="btn__spinner" aria-hidden="true" />
                <span class="muted">{note}</span>
              </div>
            )}
            {!waiting && note && <p class="muted" role="status">{note}</p>}
          </>
        )}
        <p class="small muted">
          Signed in to Sparrow as {session.value?.user?.email}.{" "}
          <button type="button" class="link-btn" onClick={signOut}>
            Not you?
          </button>
        </p>
      </Glass>
    </EntryFrame>
  );
}

export function Unavailable({ offline }) {
  useTitle("Sparrow");
  return (
    <div class="splash">
      <div class="stack" style={{ justifyItems: "center", maxWidth: "520px", padding: "0 20px" }}>
        <Mark class="brand__mark" />
        <Display pre={offline ? "You're" : "Almost"} accent={offline ? "offline" : "ready"} size="md" />
        <p class="lead">
          {offline
            ? "Sparrow can't reach its server. Check your connection and try again."
            : "Sparrow's sign-in isn't switched on for this server yet. Please check back soon."}
        </p>
        <Button icon="refresh" onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div class="splash" aria-busy="true" aria-label="Loading Sparrow">
      <div class="spinner-orb" />
    </div>
  );
}
