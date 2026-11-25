// Session bootstrap, the publik gate status, the money-free AI allowance view and the own-key path.
import { z } from "zod";
import { adminEmails } from "../config.mjs";
import { clearCookies, readAccount } from "../auth/session.mjs";
import { encryptSecret } from "../crypto.mjs";
import { fail, parseWith, publikLink, redact } from "../http.mjs";
import { loadProfile, profileJson } from "../models.mjs";
import { ensureUser, keyFor, setUsage, trackActive } from "../publik/publik.server.mjs";
import { ownKeyFor } from "../publik/store.mjs";
import { walletSummary } from "../publik/wallet.mjs";

const FALLBACK_CLAIM = "https://publikhq.com/wallet";

export function publikState(state) {
  if (state.state === "claimed") return { state: "claimed", hasPlan: !!state.hasPlan, topUpUrl: publikLink(state.topUpUrl) };
  if (state.state === "sign_in") return { state: "sign_in", claimUrl: publikLink(state.claimUrl) || FALLBACK_CLAIM };
  return { state: "unreachable", message: redact(state.message, 300) };
}

async function session(ctx) {
  const configured = !!ctx.services.authConfig(ctx.req) && !!ctx.db;
  if (!ctx.db || !ctx.key) return { authenticated: false, configured };
  const account = readAccount(ctx.req, ctx.key);
  if (!account) {
    if (/sparrow_(account|session)=/.test(ctx.req.headers.cookie || "")) ctx.cookies.push(...clearCookies(ctx.secure));
    return { authenticated: false, configured };
  }
  const rows = await ctx.db.query("select id, email, display_name, session_version from app_users where id = $1", [account.uid]);
  const row = rows[0];
  if (!row || row.session_version !== account.ver) {
    ctx.cookies.push(...clearCookies(ctx.secure));
    return { authenticated: false, configured };
  }
  const state = await ensureUser(row.id);
  if (state.state === "claimed") await trackActive(row.id);
  const profile = profileJson(await loadProfile(ctx.db, row.id));
  return {
    authenticated: true,
    configured,
    user: { name: profile.firstName || row.display_name || null, email: row.email, isAdmin: adminEmails().includes(row.email) },
    publik: publikState(state),
    profile: {
      onboarded: profile.onboarded,
      onboardingStep: profile.onboardingStep,
      tourDone: profile.tourDone,
      firstName: profile.firstName,
      grade: profile.grade,
      settings: profile.settings,
    },
  };
}

async function wallet(ctx) {
  const own = await ownKeyFor(ctx.db, ctx.user.id);
  const key = own || (await keyFor(ctx.user.id));
  const summary = key ? await walletSummary(key).catch(() => ({ reachable: false })) : { reachable: false };
  const [hint] = await ctx.db.query("select key_hint from publik_own_keys where user_id = $1", [ctx.user.id]);
  const [record] = await ctx.db.query("select record->>'usage' as usage from publik_users where user_id = $1", [ctx.user.id]);
  return {
    reachable: !!summary.reachable,
    remainingPercent: summary.remainingPercent ?? null,
    prepaidRemainingPercent: summary.prepaidRemainingPercent ?? null,
    providers: summary.providers || [],
    planLabel: summary.planLabel ?? null,
    hasPlan: summary.reachable ? !!summary.hasPlan : !!ctx.publik?.hasPlan,
    topUpUrl: summary.topUpUrl || publikLink(ctx.publik?.topUpUrl),
    usingOwnKey: !!own,
    ownKeyHint: hint?.key_hint ?? null,
    usageEnabled: record?.usage !== "false",
  };
}

const ownKeyBody = z.object({
  key: z.string().trim().regex(/^pk_[A-Za-z0-9_-]{16,250}$/, "Enter a valid personal publik API key. It starts with pk_."),
});

async function setOwnKey(ctx) {
  const { key } = parseWith(ownKeyBody, await ctx.body(1024));
  const summary = await walletSummary(key).catch(() => ({ reachable: false }));
  if (!summary.reachable) fail(400, "publik didn't accept that key. Check it and try again.");
  if (!summary.claimed) fail(400, "That key isn't linked to a publik account yet.");
  await ctx.db.query(
    `insert into publik_own_keys (user_id, key_enc, key_hint) values ($1, $2, $3)
     on conflict (user_id) do update set key_enc = excluded.key_enc, key_hint = excluded.key_hint, created_at = now()`,
    [ctx.user.id, encryptSecret(key), key.slice(-4)],
  );
  return { usingOwnKey: true, ownKeyHint: key.slice(-4) };
}

async function removeOwnKey(ctx) {
  await ctx.db.query("delete from publik_own_keys where user_id = $1", [ctx.user.id]);
  return { usingOwnKey: false };
}

async function usage(ctx) {
  const { enabled } = parseWith(z.object({ enabled: z.boolean() }), await ctx.body(256), "Choose whether usage counting is on.");
  await setUsage(ctx.user.id, enabled);
  return { usageEnabled: enabled };
}

export default [
  { method: "GET", path: "/api/session", access: "public", handler: session },
  { method: "GET", path: "/api/publik/status", access: "user", handler: async (ctx) => ({ state: (await ensureUser(ctx.user.id)).state }) },
  // A content-free heartbeat while the app is open; the app middleware counts the visit (trackActive).
  { method: "GET", path: "/api/ping", access: "app", handler: async () => ({ ok: true }) },
  { method: "GET", path: "/api/wallet", access: "app", handler: wallet },
  { method: "POST", path: "/api/publik/own-key", access: "app", handler: setOwnKey },
  { method: "DELETE", path: "/api/publik/own-key", access: "app", handler: removeOwnKey },
  { method: "POST", path: "/api/publik/usage", access: "app", handler: usage },
];
