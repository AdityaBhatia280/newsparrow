import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.js";
import { effectsSetting, saveEffectsSetting } from "../lib/effects.js";
import { useTitle } from "../lib/hooks.js";
import { navigate } from "../lib/router.js";
import { confirmAction, refreshSession, session, toast } from "../lib/store.js";
import { useWallet } from "../ui/ai.jsx";
import { Icon } from "../ui/icons.jsx";
import { Button, Glass, Notice, PageHead, Ring, Segmented, Switch, TextField } from "../ui/kit.jsx";

export function Settings() {
  useTitle("Settings");
  const user = session.value?.user || {};
  const walletNow = useWallet();
  const [wallet, setWallet] = useState(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [effects, setEffects] = useState(effectsSetting());
  useEffect(() => setWallet(walletNow), [walletNow]);
  useEffect(() => {
    if (location.hash === "#ai") document.getElementById("ai")?.scrollIntoView({ block: "start" });
  }, []);

  const saveKey = async (e) => {
    e.preventDefault();
    setBusy(true);
    setKeyError("");
    try {
      const r = await api.post("/api/publik/own-key", { key: key.trim() });
      setKey("");
      setWallet({ ...wallet, usingOwnKey: true, ownKeyHint: r.ownKeyHint });
      toast("Your own publik key is saved and encrypted.", "ok");
    } catch (err) {
      setKeyError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const removeKey = async () => {
    try {
      await api.del("/api/publik/own-key");
      setWallet({ ...wallet, usingOwnKey: false, ownKeyHint: null });
      toast("Removed. Sparrow will use your publik account again.");
    } catch (err) {
      toast(err.message, "bad");
    }
  };
  const setUsage = async (enabled) => {
    setWallet({ ...wallet, usageEnabled: enabled });
    try {
      await api.post("/api/publik/usage", { enabled });
    } catch (err) {
      setWallet({ ...wallet, usageEnabled: !enabled });
      toast(err.message, "bad");
    }
  };
  const signOut = async () => {
    await api.post("/api/auth", { action: "sign_out" }).catch(() => {});
    await refreshSession();
    navigate("/app", { replace: true });
  };
  const signOutAll = async () => {
    if (!(await confirmAction({ title: "Sign out everywhere?", body: "You'll be signed out on every device, including this one.", confirmLabel: "Sign out everywhere" }))) return;
    await api.post("/api/account/sign-out-everywhere").catch((e) => toast(e.message, "bad"));
    await refreshSession();
  };
  const deleteAccount = async () => {
    const ok = await confirmAction({
      title: "Delete your Sparrow account?",
      body: "This permanently deletes your profile, activities, saved opportunities, tasks, colleges, advisor history, suggestions and points. Your publik account is separate and isn't affected.",
      confirmLabel: "Delete everything",
      tone: "danger",
      requireText: "DELETE",
    });
    if (!ok) return;
    try {
      const r = await api.del("/api/account", { confirm: "DELETE" });
      toast("Your account is deleted.", "ok");
      setTimeout(() => location.assign("/"), 900);
    } catch (err) {
      toast(err.message, "bad");
    }
  };
  const left = wallet?.remainingPercent ?? wallet?.prepaidRemainingPercent;
  return (
    <div class="settings">
      <PageHead kicker="Settings" pre="Your" accent="account" />
      <div class="settings__grid">
        <Glass pad="lg" class="stack">
          <h2 class="h-sub">Account</h2>
          <dl class="facts facts--compact">
            <div>
              <dt>Name</dt>
              <dd>{user.name || "Not set"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>
          <div class="row">
            <Button variant="quiet" icon="log-out" onClick={signOut}>
              Sign out
            </Button>
            <Button variant="ghost" onClick={signOutAll}>
              Sign out everywhere
            </Button>
          </div>
        </Glass>

        <Glass pad="lg" class="stack" id="ai">
          <h2 class="h-sub">AI & publik</h2>
          {wallet?.reachable ? (
            <div class="row" style={{ gap: "14px" }}>
              <Ring value={left ?? 0} size={52} />
              <div>
                <strong>{Number.isFinite(left) ? `${left}% of your AI allowance left` : "Connected to publik"}</strong>
                <p class="small muted">
                  {wallet.usingOwnKey ? `Using your own key ending in ${wallet.ownKeyHint}.` : wallet.planLabel || "Your publik account."} AI providers:{" "}
                  {wallet.providers?.join(", ") || "see publik"}.
                </p>
              </div>
            </div>
          ) : (
            <Notice tone="warn">publik isn't reachable right now. AI features will be back when it is.</Notice>
          )}
          {!wallet?.hasPlan && !wallet?.usingOwnKey && wallet?.topUpUrl && (
            <Button href={wallet.topUpUrl} iconRight="arrow-up-right" size="sm">
              Get a plan
            </Button>
          )}
          {wallet?.usingOwnKey ? (
            <Button variant="ghost" size="sm" icon="trash" onClick={removeKey}>
              Stop using my own key
            </Button>
          ) : (
            <form class="stack stack--sm" onSubmit={saveKey}>
              <TextField
                label="Use my own publik API key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="pk_…"
                value={key}
                onInput={setKey}
                error={keyError}
                hint="Sent once to Sparrow's server, encrypted, and never shown again or stored in your browser."
              />
              <div>
                <Button type="submit" variant="quiet" icon="key" loading={busy} disabled={!key.trim()}>
                  Save key
                </Button>
              </div>
            </form>
          )}
          <Switch
            checked={wallet?.usageEnabled !== false}
            onChange={setUsage}
            label="Count my visits for publik"
            description="Sends “opened” and “still here” pings with no content, so publik can count Sparrow's users. You can turn it off any time."
          />
        </Glass>

        <Glass pad="lg" class="stack">
          <h2 class="h-sub">Appearance</h2>
          <p class="muted small">Glass and motion look great but take more power. Auto turns them down on slower devices.</p>
          <Segmented
            label="Visual effects"
            value={effects}
            options={[
              { id: "auto", label: "Auto" },
              { id: "on", label: "Full" },
              { id: "off", label: "Reduced" },
            ]}
            onChange={(v) => {
              setEffects(v);
              saveEffectsSetting(v);
            }}
          />
        </Glass>

        <Glass pad="lg" class="stack">
          <h2 class="h-sub">Your data</h2>
          <p class="muted small">Download everything Sparrow stores about you as a JSON file, or delete your account.</p>
          <div class="row">
            <a class="btn btn--quiet" href="/api/export" download="sparrow-data.json" data-native>
              <Icon name="download" /> Export my data
            </a>
            <Button variant="danger" icon="trash" onClick={deleteAccount}>
              Delete account
            </Button>
          </div>
          <p class="small muted">
            <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a>
          </p>
        </Glass>
      </div>
    </div>
  );
}
