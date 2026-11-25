import { render } from "preact";
import "./styles/app.css";
import { App } from "./app.jsx";
import { applyEffects, effectsSetting } from "./lib/effects.js";
import { refreshSession } from "./lib/store.js";

applyEffects(effectsSetting());
render(<App />, document.getElementById("root"));
refreshSession();

// Keep counting an open visit (publik's active_session) while the tab is visible, without any content.
setInterval(() => {
  if (document.visibilityState === "visible" && document.querySelector("#dock")) fetch("/api/ping", { credentials: "same-origin" }).catch(() => {});
}, 10 * 60_000);
