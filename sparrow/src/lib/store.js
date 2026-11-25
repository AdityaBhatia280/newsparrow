// Global state: the session, toasts and a promise-based confirm dialog.
import { signal } from "@preact/signals";
import { api, onApiError } from "./api.js";

export const session = signal(null);
export const toasts = signal([]);
export const confirmState = signal(null);

let toastId = 0;
export function toast(message, tone = "info", ms = 3600) {
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-2), { id, message, tone }];
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms);
}

export async function refreshSession() {
  try {
    session.value = await api.get("/api/session");
  } catch (error) {
    session.value = { authenticated: false, configured: error.status !== 0, offline: error.status === 0 };
  }
  return session.value;
}

/** Resolves true when the person confirms. */
export function confirmAction({ title, body, confirmLabel = "Confirm", tone = "primary", requireText = null }) {
  return new Promise((resolve) => {
    confirmState.value = { title, body, confirmLabel, tone, requireText, resolve };
  });
}

// A session that ended, or a publik gate that reappeared, re-routes the shell.
onApiError((error) => {
  if (error.status === 401 && error.code === "signed_out") refreshSession();
  if (error.status === 428 && error.code === "publik_sign_in" && session.value?.authenticated)
    session.value = { ...session.value, publik: { state: "sign_in", claimUrl: null } };
});
