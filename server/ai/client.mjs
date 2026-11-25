// Every billable publik call goes through here: per-user rate limits, durable idempotency, the person's own provider,
// the 402 rule (provider message + exactly one link), validated output, and no automatic retries.
import { DEFAULT_BASE_URL, MODELS, resolveProvider, topUpUrlFrom402 } from "../publik/publik.server.mjs";
import { ownKeyFor } from "../publik/store.mjs";
import { fail, publikLink, redact } from "../http.mjs";

export const LIMIT_PER_MINUTE = 6;
export const LIMIT_PER_DAY = 60;

export function looseJson(content) {
  if (typeof content !== "string") return null;
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(text.slice(a, b + 1));
    } catch {}
  }
  return null;
}

async function provider(ctx) {
  const own = await ownKeyFor(ctx.db, ctx.user.id);
  const p = await resolveProvider(ctx.user.id, own ? { baseURL: DEFAULT_BASE_URL, apiKey: own } : null);
  if (p.kind === "needs_sign_in") fail(428, "Sign in with publik to use AI.", { code: "publik_sign_in" });
  if (p.kind === "needs_own_key") fail(409, "Add your own publik key in Settings to use AI.");
  return p;
}

async function begin(ctx, kind, requestId) {
  const [usage] = await ctx.db.query(
    `select count(*) filter (where created_at > now() - interval '1 minute')::int as minute,
            count(*) filter (where created_at > now() - interval '1 day')::int as day
       from provider_requests where user_id = $1`,
    [ctx.user.id],
  );
  if (usage.minute >= LIMIT_PER_MINUTE) fail(429, "Wait a minute before sending another AI request.");
  if (usage.day >= LIMIT_PER_DAY) fail(429, "You've reached today's AI limit in Sparrow. Try again tomorrow.");
  const rows = await ctx.db.query(
    `insert into provider_requests (user_id, request_id, kind) values ($1, $2, $3)
     on conflict (user_id, request_id) do nothing returning id`,
    [ctx.user.id, requestId, kind],
  );
  if (!rows.length) fail(409, "This request was already sent. Check its result or your publik usage before sending a new one.");
  return rows[0].id;
}

const finish = (ctx, id, status, httpStatus = null, providerRequestId = null) =>
  ctx.db.query("update provider_requests set status = $2, http_status = $3, provider_request_id = $4 where id = $1", [
    id, status, httpStatus, providerRequestId,
  ]);

async function send(ctx, kind, requestId, path, body) {
  const p = await provider(ctx);
  const id = await begin(ctx, kind, requestId);
  let upstream;
  try {
    upstream = await fetch(`${p.baseURL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${p.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    await finish(ctx, id, "unknown");
    fail(503, "The AI connection ended before an answer arrived. Your work is saved. The request may still have been processed, so check your publik usage before trying again.");
  }
  const providerRequestId = upstream.headers.get("x-publik-request-id");
  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    await finish(ctx, id, "failed", upstream.status, providerRequestId);
    if (upstream.status === 402) {
      const top = topUpUrlFrom402(data);
      fail(402, redact(top.message), { topUpUrl: publikLink(top.url), providerRequestId, code: "insufficient_credit" });
    }
    if (upstream.status === 429)
      fail(429, redact(data?.error?.message || "publik is busy right now. Wait a moment, then try again."), {
        retryAfter: upstream.headers.get("retry-after"),
        providerRequestId,
      });
    fail(502, redact(data?.error?.message || `publik couldn't complete the request (${upstream.status}).`), { providerRequestId });
  }
  return { id, data, providerRequestId };
}

/** A JSON-mode chat completion validated by `schema`. */
export async function callModel(ctx, { kind, requestId, tier = "balanced", system, user, schema, maxTokens = 1600, temperature = 0.3 }) {
  const { id, data, providerRequestId } = await send(ctx, kind, requestId, "/chat/completions", {
    model: MODELS[tier] || MODELS.balanced,
    messages: [
      { role: "system", content: system },
      { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) },
    ],
    response_format: { type: "json_object" },
    max_tokens: maxTokens,
    temperature,
  });
  const parsed = schema.safeParse(looseJson(data?.choices?.[0]?.message?.content));
  if (!parsed.success) {
    await finish(ctx, id, "failed", 200, providerRequestId);
    fail(502, "The AI answer didn't pass Sparrow's checks. Your work is saved. Don't resend right away; check your publik usage first.", { providerRequestId });
  }
  await finish(ctx, id, "succeeded", 200, providerRequestId);
  return { data: parsed.data, providerRequestId };
}

/** publik web search (POST /search). */
export async function webSearch(ctx, { requestId, q, count = 10 }) {
  const { id, data, providerRequestId } = await send(ctx, "search", requestId, "/search", { q, count });
  const results = (Array.isArray(data?.results) ? data.results : [])
    .map((r) => {
      try {
        const u = new URL(String(r.url));
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        const clean = (s, n) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, n);
        return { url: u.href, title: clean(r.title, 160) || u.hostname, snippet: clean(r.snippet, 320), site: clean(r.site, 80) || u.hostname };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, count);
  await finish(ctx, id, "succeeded", 200, providerRequestId);
  return { results, providerRequestId };
}
