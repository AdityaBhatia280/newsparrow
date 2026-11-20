import { execFileSync } from "node:child_process";
import fs from "node:fs";
const files = [
  "sparrow/dist/app.js",
  "sparrow/dist/data.js",
  "sparrow/dist/publik.js",
  "server/publik.mjs",
  "server/publik-handler.mjs",
  "server/advisor.mjs",
  "server/session.mjs",
  "sparrow/server.mjs",
];
for (const file of files)
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
for (const file of [
  "index.html",
  "style.css",
  "publik.js",
  "app.js",
  "data.js",
]) {
  if (!fs.existsSync("sparrow/dist/" + file))
    throw new Error("Missing deployable file: " + file);
}
console.log(
  "Sparrow build verified: static frontend and server-only publik API.",
);
