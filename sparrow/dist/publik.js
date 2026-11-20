"use strict";
(() => {
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  let info = null,
    timer = null,
    pollUntil = Date.now() + 600000,
    lastGate = "";
  async function call(action, fields = {}) {
    let response;
    try {
      response = await fetch("/api/publik", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...fields }),
        signal: AbortSignal.timeout(action === "advisor" ? 65000 : 30000),
      });
    } catch {
      throw new Error(
        action === "advisor"
          ? "The connection ended before an advisor result arrived. Your draft is saved. The request outcome may be unknown; check provider usage before retrying."
          : "publik is not reachable. Check your connection.",
      );
    }
    const value = await response
      .json()
      .catch(() => ({ error: "Sparrow could not read the server response." }));
    if (!response.ok) {
      const e = new Error(value.error || "The request could not be completed.");
      e.status = response.status;
      e.topUpUrl = value.topUpUrl || null;
      e.providerRequestId = value.providerRequestId || null;
      throw e;
    }
    return value;
  }
  function gateUI(data, error) {
    const s = data?.screen || {
      id: "unreachable",
      title: "Sign in with publik",
      body: error || "publik is not reachable. Check your connection.",
      buttons: [{ action: "retry", label: "Retry" }],
    };
    const signature = JSON.stringify([s, data?.signInUrl, data?.planUrl]);
    const main = document.querySelector("#main");
    if (signature !== lastGate) {
      main.innerHTML = `<div class="page wrap auth-page"><div class="form-card"><a class="brand" href="/" aria-label="Sparrow"><svg aria-hidden="true" viewBox="0 0 40 40"><path fill="currentColor" d="M3 12 19 18 36 5 27 24 13 34 16 22Z"/></svg>sparrow</a><p class="kicker" style="margin-top:32px">Your path starts here</p><h1>${esc(s.title)}</h1><p class="auth-body">${esc(s.body)}</p>${s.note ? `<p class="notice neutral">${esc(s.note)}</p>` : ""}<div class="actions">${s.buttons
        .filter((button) => button.action !== "own_key")
        .map((b) => {
          const url =
            b.action === "sign_in"
              ? data?.signInUrl
              : b.action === "get_plan"
                ? data?.planUrl
                : null;
          return url
            ? `<a class="btn" data-gate="${b.action}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(b.label)} <span aria-hidden="true">â†—</span></a>`
            : `<button class="btn ${b.action === "own_key" ? "secondary" : ""}" data-gate="${b.action}">${esc(b.label)}</button>`;
        })
        .join(
          "",
        )}</div><p class="small muted" style="margin-top:24px">Sparrow uses publik for sign-in and optional AI access. Your planning workspace stays browser-local. No AI request is made by opening this screen.</p><div class="error" role="alert" id="gate-error"></div></div></div>`;
      main.querySelector("h1").tabIndex = -1;
      main.querySelector("h1").focus({ preventScroll: true });
      lastGate = signature;
    }
    return new Promise((resolve) => {
      let timeout;
      const finish = (action) => {
        clearTimeout(timeout);
        resolve(action);
      };
      main.querySelectorAll("[data-gate]").forEach(
        (el) =>
          (el.onclick = () => {
            if (["sign_in", "get_plan"].includes(el.dataset.gate)) {
              pollUntil = Date.now() + 600000;
              finish("poll");
            } else finish(el.dataset.gate);
          }),
      );
      if (s.id === "sign_in" && Date.now() < pollUntil)
        timeout = setTimeout(() => finish("poll"), 3000);
    });
  }
  async function ensureSignedIn(ui = { show: gateUI }) {
    for (;;) {
      let value;
      try {
        value = await call("status");
      } catch (e) {
        await ui.show(null, e.message);
        continue;
      }
      if (value.authenticated) {
        info = value;
        lastGate = "";
        try {
          await call("open");
        } catch {}
        clearInterval(timer);
        timer = setInterval(async () => {
          try {
            const active = await call("active");
            if (!active.authenticated) location.reload();
          } catch {}
        }, 1800000);
        return value;
      }
      const action = await ui.show(value);
      if (action === "connect" || action === "own_key") {
        try {
          await call("choice", {
            choice: action === "connect" ? "publik" : "own_key",
          });
        } catch (e) {
          document.querySelector("#gate-error").textContent = e.message;
          await new Promise((r) => setTimeout(r, 1200));
        }
      } else if (action === "retry") pollUntil = Date.now() + 600000;
      else if (action === "poll") await new Promise((r) => setTimeout(r, 500));
    }
  }
  async function refresh() {
    info = await call("status");
    if (!info.authenticated) {
      location.reload();
      throw new Error("Sign in again.");
    }
    return info;
  }
  window.SparrowPublik = {
    ensureSignedIn,
    call,
    refresh,
    get info() {
      return info;
    },
    async setChoice(choice) {
      const next = await call("choice", { choice });
      if (!next.authenticated) {
        location.reload();
        return;
      }
      info = next;
      return next;
    },
    async setOwnKey(key) {
      const next = await call("own_key", { key });
      info = next;
      return next;
    },
    async setUsage(enabled) {
      info = await call("usage", { enabled });
      return info;
    },
    async signOut() {
      clearInterval(timer);
      await call("sign_out");
      location.reload();
    },
  };
})();


