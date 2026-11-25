import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { api } from "./api.js";

/** Loads a JSON resource; `path` null skips loading. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(path);
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState({ data: null, error, loading: false });
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === "function" ? fn(s.data) : fn })), []);
  return { ...state, reload: load, setData };
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Runs `save(value)` shortly after the value stops changing. */
export function useAutosave(value, save, ms = 700) {
  const first = useRef(true);
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => latest.current(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
}

/** Sets --mx/--my on interactive glass so the highlight follows the pointer. */
export function glint(event) {
  const el = event.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${event.clientX - r.left}px`);
  el.style.setProperty("--my", `${event.clientY - r.top}px`);
}

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Sparrow` : "Sparrow";
  }, [title]);
}
