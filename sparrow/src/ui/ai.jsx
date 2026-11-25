// Consent before every AI request (providers named from a fresh wallet read), and publik's error rules:
// a 402 shows the provider's message plus exactly one link.
import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.js";
import { Icon } from "./icons.jsx";
import { Check, Notice } from "./kit.jsx";

export function useWallet(active = true) {
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    api.get("/api/wallet").then((w) => alive && setWallet(w)).catch(() => alive && setWallet({ reachable: false, providers: [] }));
    return () => {
      alive = false;
    };
  }, [active]);
  return wallet;
}

export function AiConsent({ checked, onChange, what, compact }) {
  const wallet = useWallet();
  const providers = wallet?.providers?.length ? wallet.providers.join(", ") : "publik's AI providers";
  const left = wallet?.remainingPercent ?? wallet?.prepaidRemainingPercent;
  return (
    <div class={compact ? "consent consent--compact" : "consent"}>
      <Check checked={checked} onChange={onChange}>
        Send {what} to AI through publik ({providers}). It uses part of your publik allowance
        {Number.isFinite(left) ? ` (${left}% left)` : ""}.
      </Check>
      {wallet && !wallet.hasPlan && !wallet.usingOwnKey && (
        <p class="consent__plan small">
          <Icon name="info" size={15} /> You don't have a publik plan yet, so AI may not answer.{" "}
          {wallet.topUpUrl && (
            <a href={wallet.topUpUrl} target="_blank" rel="noopener noreferrer">
              Get a plan
            </a>
          )}
          {wallet.topUpUrl && " · "}
          <a href="/app/settings#ai">Use my own key</a>
        </p>
      )}
    </div>
  );
}

export function AiError({ error }) {
  if (!error) return null;
  return (
    <Notice tone={error.status === 402 ? "warn" : "bad"}>
      <span>{error.message}</span>
      {error.status === 402 && error.topUpUrl && (
        <>
          {" "}
          <a href={error.topUpUrl} target="_blank" rel="noopener noreferrer">
            Open publik
          </a>
        </>
      )}
      {error.status === 429 && error.retryAfter && <span> Try again in about {error.retryAfter} seconds.</span>}
    </Notice>
  );
}
