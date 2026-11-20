import { randomUUID } from "node:crypto";
import * as sdk from "./publik.mjs";
import {
  sessionKey,
  readSession,
  setSession,
  clearSession,
  principal,
} from "./session.mjs";
import { advisorInput, advisorOutput, systemPrompt } from "./advisor.mjs";

class GateNeeded extends Error {
  constructor(screen) {
    super("Sign-in gate required");
    this.screen = screen;
  }
}
const limits = new Map(),
  requests = new Map();
const redact = (s) =>
  String(s || "")
    .replace(/(?:pat_|pk_|pbt_)[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 900);
function link(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" &&
      u.hostname === "publikhq.com" &&
      !u.username &&
      !u.password &&
      !/(?:pat_|pk_|pbt_)[A-Za-z0-9_-]+/.test(u.href)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function allow(key, max, period) {
  const now = Date.now(),
    v = limits.get(key);
  if (!v || v.until < now) {
    limits.set(key, { n: 1, until: now + period });
    return true;
  }
  if (v.n >= max) return false;
  v.n++;
  if (limits.size > 5000)
    for (const [k, t] of limits) if (t.until < now) limits.delete(k);
  return true;
}
async function body(req) {
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 20000)
      throw new Error("PAYLOAD_LIMIT");
    return req.body;
  }
  let size = 0,
    data = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20000) throw new Error("PAYLOAD_LIMIT");
    data += chunk;
  }
  return JSON.parse(data || "{}");
}
function projection(wallet, credential, key) {
  return {
    principal: principal(credential, wallet, key),
    handle: wallet.account?.handle || null,
    remainingPercent: Number.isFinite(wallet.remaining_percent)
      ? Math.max(0, Math.min(100, wallet.remaining_percent))
      : null,
    prepaidRemainingPercent: Number.isFinite(wallet.prepaid_remaining_percent)
      ? Math.max(0, Math.min(100, wallet.prepaid_remaining_percent))
      : null,
    providers: Array.isArray(wallet.ai_providers)
      ? wallet.ai_providers.filter((x) => typeof x === "string").slice(0, 10)
      : [],
    choice: credential.choice || null,
  };
}

export function createHandler(options = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Cookie");
    const reply = (code, value) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(value));
    };
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return reply(405, { error: "Use POST." });
    }
    const origins = new Set(
      options.origins || [
        "https://newsparrow.vercel.app",
        ...(process.env.VERCEL_URL
          ? [`https://${process.env.VERCEL_URL}`]
          : []),
        ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
          : []),
      ],
    );
    const hosted=!!(process.env.VERCEL||process.env.K_SERVICE||process.env.NODE_ENV==='production');
    if (!hosted) {
      const host = String(req.headers.host || "");
      if (/^(localhost|127\.0\.0\.1):\d+$/.test(host))
        origins.add("http://" + host);
    }
    if (!origins.has(req.headers.origin))
      return reply(403, { error: "This request must come from Sparrow." });
    if (
      !String(req.headers["content-type"] || "").startsWith("application/json")
    )
      return reply(415, { error: "Use application/json." });
    const secure = options.secure ?? hosted;
    let key, input;
    try {
      key = sessionKey(options.secret);
      input = await body(req);
    } catch (e) {
      return reply(
        e.message === "PAYLOAD_LIMIT"
          ? 413
          : e instanceof SyntaxError
            ? 400
            : 503,
        {
          error:
            e.message === "PAYLOAD_LIMIT"
              ? "Request is too large."
              : e instanceof SyntaxError
                ? "Invalid JSON."
                : "Sparrow sign-in is not configured on this server yet.",
        },
      );
    }
    const allowed = [
      "status",
      "open",
      "active",
      "choice",
      "own_key",
      "usage",
      "sign_out",
      "advisor",
    ];
    if (!input || typeof input !== "object" || !allowed.includes(input.action))
      return reply(400, { error: "Unsupported action." });
    if (input.action === "sign_out") {
      clearSession(res, secure);
      return reply(200, { signedOut: true });
    }
    let session = readSession(req.headers.cookie, key) || {
      install: null,
      usage: true,
    };
    if (!session.install && input.action !== "status")
      return reply(401, { error: "Sign in with publik again." });
    const caller =
      session.install?.install_id ||
      String(
        req.headers["x-vercel-forwarded-for"] ||
          req.socket?.remoteAddress ||
          "new",
      );
    if (!allow("request:" + caller, 90, 60000))
      return reply(429, {
        error: "Too many requests. Wait a minute before trying again.",
      });
    const context = {
      credential: session.install,
      usage: session.usage !== false,
      recordOpen: input.action === "open",
      events: [],
    };
    await sdk.hostedScope.run(context, async () => {
      let statusCode = 200,
        response;
      try {
        if (input.action === "usage") {
          if (typeof input.enabled !== "boolean")
            return reply(400, {
              error: "Choose whether usage counting is enabled.",
            });
          session.usage = input.enabled;
          context.usage = input.enabled;
        }
        if (input.action === "choice" || input.action === "own_key") {
          const verified = await sdk.readWallet(context.credential.key);
          if (verified.wallet?.claim_state !== "claimed")
            return reply(401, { error: "Sign in with publik first." });
          if (input.action === "choice") {
            if (!["publik", "own_key", null].includes(input.choice))
              return reply(400, { error: "Unsupported provider choice." });
            if (
              input.choice === "publik" &&
              verified.wallet.plan.kind === "none" &&
              verified.wallet.balance_micros <= 0
            )
              return reply(402, {
                error: "Get a publik plan before connecting it.",
                topUpUrl: link(verified.wallet.top_up_url),
              });
            sdk.setChoice(input.choice);
          } else {
            if (
              typeof input.key !== "string" ||
              !/^pk_[A-Za-z0-9_-]{16,250}$/.test(input.key.trim())
            )
              return reply(400, {
                error: "Enter a valid personal publik API key.",
              });
            const personal = input.key.trim(),
              check = await sdk.readWallet(personal);
            if (check.wallet?.claim_state !== "claimed")
              return reply(400, {
                error:
                  "This personal key is invalid or is not linked to a publik account.",
              });
            session.ownKey = personal;
            sdk.setChoice("own_key");
          }
        }
        const ui = {
          show: async (screen) => {
            throw new GateNeeded(screen);
          },
          openUrl: () => {
            throw new Error("Browser links must be opened by the visitor.");
          },
        };
        const gate = await sdk.ensureSignedIn(ui);
        const pub = projection(gate.wallet, context.credential, key);
        const provider = sdk.resolveProvider(
          session.ownKey
            ? { baseURL: sdk.DEFAULT_BASE_URL, apiKey: session.ownKey }
            : null,
        );
        response = {
          authenticated: true,
          ...pub,
          providerReady: provider.kind !== "needs_own_key",
          usageEnabled: session.usage !== false,
        };
        if (input.action === "active") await sdk.sendEvent("active_session");
        if (input.action === "advisor") {
          const parsed = advisorInput.safeParse(input.request);
          if (!parsed.success) {
            statusCode = 400;
            response = {
              error:
                "Review the request, profile limits, and confirmation before sending.",
            };
          } else if (provider.kind === "needs_own_key") {
            statusCode = 409;
            response = {
              error:
                "Add your personal publik API key in Settings, or connect a publik plan.",
            };
          } else if (!allow("advisor:" + pub.principal, 6, 60000)) {
            statusCode = 429;
            response = {
              error: "Wait a minute before sending another advisor request.",
            };
          } else {
            const nonce = pub.principal + ":" + parsed.data.requestId;
            if (requests.has(nonce)) {
              statusCode = 409;
              response = {
                error:
                  "This request was already sent. Check its result or provider usage before sending a new request.",
              };
            } else {
              requests.set(nonce, Date.now());
              for (const [id, at] of requests)
                if (at < Date.now() - 3600000) requests.delete(id);
              const upstream = await fetch(
                `${provider.baseURL}/chat/completions`,
                {
                  method: "POST",
                  headers: {
                    authorization: `Bearer ${provider.apiKey}`,
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "publik-balanced",
                    messages: [
                      { role: "system", content: systemPrompt },
                      {
                        role: "user",
                        content: JSON.stringify({
                          task: parsed.data.task,
                          profile: parsed.data.profile,
                          userMessage: parsed.data.draft,
                          verifiedRecords: [],
                        }),
                      },
                    ],
                    response_format: { type: "json_object" },
                    max_tokens: 1400,
                    temperature: 0.4,
                  }),
                  signal: AbortSignal.timeout(40000),
                },
              );
              const data = await upstream.json().catch(() => null),
                providerRequestId = upstream.headers.get("x-publik-request-id");
              if (!upstream.ok) {
                statusCode = upstream.status;
                response = {
                  error: redact(
                    data?.error?.message ||
                      `publik could not complete the request (${upstream.status}).`,
                  ),
                  ...(upstream.status === 402
                    ? { topUpUrl: link(data?.error?.top_up_url) }
                    : {}),
                  providerRequestId,
                };
              } else {
                let answer;
                try {
                  answer = JSON.parse(
                    data?.choices?.[0]?.message?.content || "",
                  );
                } catch {}
                const result = advisorOutput.safeParse(answer);
                if (!result.success) {
                  statusCode = 502;
                  response = {
                    error:
                      "The advisor response did not pass validation. Your draft is saved. Do not resend automatically; check provider usage first.",
                    providerRequestId,
                  };
                } else response = { answer: result.data, providerRequestId };
              }
            }
          }
        }
      } catch (e) {
        if (e instanceof GateNeeded) {
          let wallet = null;
          try {
            if (context.credential)
              wallet = (await sdk.readWallet(context.credential.key)).wallet;
          } catch {}
          response = {
            authenticated: false,
            screen: {
              ...e.screen,
              title: redact(e.screen.title),
              body: redact(e.screen.body),
              note: e.screen.note ? redact(e.screen.note) : null,
            },
            signInUrl: link(wallet?.claim_url || context.credential?.claim_url),
            planUrl: link(wallet?.top_up_url),
            usageEnabled: session.usage !== false,
          };
        } else {
          statusCode = 503;
          response = {
            error:
              input.action === "advisor"
                ? "The provider connection failed. Your draft is saved. The request outcome may be unknown; check provider usage before retrying."
                : "publik is not reachable. Check your connection.",
          };
        }
      }
      await Promise.allSettled(context.events);
      session.install = context.credential;
      try {
        if (session.install) setSession(res, session, key, secure);
        else clearSession(res, secure);
      } catch {
        return reply(503, {
          error: "Sparrow could not save this sign-in session.",
        });
      }
      reply(statusCode, response);
    });
  };
}
export default createHandler();
