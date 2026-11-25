// A fresh, money-free view of a person's publik allowance for consent and usage screens.
// publik's rule: show use only as a share (percent), and read ai_providers again before showing it.
import { DEFAULT_BASE_URL } from "./publik.server.mjs";
import { publikLink } from "../http.mjs";

const percent = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

export async function walletSummary(key) {
  const res = await fetch(`${DEFAULT_BASE_URL}/wallet`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(12_000),
  });
  const w = await res.json().catch(() => null);
  if (!res.ok || typeof w?.claim_state !== "string") return { reachable: false };
  const plan = w.plan?.kind ?? "none";
  return {
    reachable: true,
    claimed: w.claim_state === "claimed",
    remainingPercent: percent(w.remaining_percent),
    prepaidRemainingPercent: percent(w.prepaid_remaining_percent),
    providers: Array.isArray(w.ai_providers) ? w.ai_providers.filter((p) => typeof p === "string").slice(0, 12) : [],
    planLabel: plan !== "none" && typeof w.plan?.label === "string" ? w.plan.label.slice(0, 60) : null,
    hasPlan: plan !== "none" || (w.balance_micros ?? 0) > 0,
    topUpUrl: publikLink(w.top_up_url),
  };
}
