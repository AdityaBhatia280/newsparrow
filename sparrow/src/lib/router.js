// A small history router for /app/*, with View Transitions where the browser supports them.
import { signal } from "@preact/signals";

const parse = (loc) => ({ path: loc.pathname.replace(/\/+$/, "") || "/", query: new URLSearchParams(loc.search), hash: loc.hash });

export const route = signal(parse(location));

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.effects === "reduced";
// Rendering is paused while a view transition's update callback runs, so wait on a macrotask (never rAF) for Preact to re-render.
const rendered = () => new Promise((r) => setTimeout(() => setTimeout(r, 0), 0));

export function navigate(to, { replace = false, scroll = true } = {}) {
  const url = new URL(to, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/app")) {
    location.assign(url.href);
    return;
  }
  const same = url.pathname === location.pathname;
  const apply = () => {
    history[replace ? "replaceState" : "pushState"](null, "", url.pathname + url.search + url.hash);
    route.value = parse(url);
    if (scroll && !same) window.scrollTo(0, 0);
  };
  if (!same && document.startViewTransition && !reducedMotion()) {
    document.startViewTransition(async () => {
      apply();
      await rendered();
    });
  } else apply();
}

/** Replaces query parameters on the current route without adding history entries. */
export function setQuery(changes) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === null || v === "" || v === false) q.delete(k);
    else q.set(k, v === true ? "1" : String(v));
  }
  const s = q.toString();
  navigate(location.pathname + (s ? "?" + s : ""), { replace: true, scroll: false });
}

export function match(pattern, path) {
  const names = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "$");
  const m = re.exec(path);
  if (!m) return null;
  return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
}

addEventListener("popstate", () => {
  route.value = parse(location);
});

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const a = event.target.closest?.("a[href]");
  if (!a || a.target || a.hasAttribute("download") || a.dataset.native !== undefined) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/app")) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
