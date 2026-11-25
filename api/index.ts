// The single Vercel function. vercel.json rewrites every /api/* path here; server/app.mjs routes it.
import { createApp } from "../server/app.mjs";

export default createApp();
