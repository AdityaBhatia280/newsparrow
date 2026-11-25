// Same-origin JSON client. Errors carry the server's message, plus publik's one top-up link on 402.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status === 0 ? "Sparrow can't reach the server. Check your connection." : "Something went wrong. Try again."));
    this.status = status;
    this.code = body?.code ?? null;
    this.topUpUrl = body?.topUpUrl ?? null;
    this.providerRequestId = body?.providerRequestId ?? null;
    this.retryAfter = body?.retryAfter ?? null;
    this.slug = body?.slug ?? null;
  }
}

const listeners = new Set();
/** Called for every failed request (used to react to an ended session or the publik gate). */
export const onApiError = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export async function api(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(0, null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new ApiError(res.status, data);
    for (const fn of listeners) fn(error);
    throw error;
  }
  return data;
}

api.get = (path, options) => api(path, options);
api.post = (path, body) => api(path, { method: "POST", body });
api.patch = (path, body) => api(path, { method: "PATCH", body });
api.put = (path, body) => api(path, { method: "PUT", body });
api.del = (path, body) => api(path, { method: "DELETE", body });

export const uuid = () =>
  crypto.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

export function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, v === true ? "1" : String(v));
  const s = q.toString();
  return s ? "?" + s : "";
}
