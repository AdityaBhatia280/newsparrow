// npm run build: sparrow/public + bundled sparrow/src → sparrow/dist (static output for Vercel), then a server syntax check.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const at = (...p) => path.join(ROOT, ...p);
const DIST = at("sparrow", "dist");

await fs.rm(DIST, { recursive: true, force: true });
await fs.cp(at("sparrow", "public"), DIST, { recursive: true });

// Self-hosted fonts (SIL Open Font License) and the pdf.js worker for in-browser resume reading.
await fs.mkdir(path.join(DIST, "fonts"), { recursive: true });
const FONTS = [
  ["@fontsource-variable/inter", "inter-latin-wght-normal.woff2"],
  ["@fontsource/anton", "anton-latin-400-normal.woff2"],
  ["@fontsource/caveat", "caveat-latin-500-normal.woff2"],
  ["@fontsource/caveat", "caveat-latin-600-normal.woff2"],
];
for (const [pkg, file] of FONTS) await fs.copyFile(at("node_modules", pkg, "files", file), path.join(DIST, "fonts", file));
const licenses = [];
for (const pkg of new Set(FONTS.map(([p]) => p))) licenses.push(`${pkg}\n\n${await fs.readFile(at("node_modules", pkg, "LICENSE"), "utf8")}`);
await fs.writeFile(path.join(DIST, "fonts", "LICENSES.txt"), licenses.join("\n\n----\n\n"));
await fs.mkdir(path.join(DIST, "vendor"), { recursive: true });
await fs.copyFile(at("node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"), path.join(DIST, "vendor", "pdf.worker.min.mjs"));

// The public contact address comes from the server environment at build time (Vercel exposes it to builds).
const email = (process.env.SPARROW_SUPPORT_EMAIL || "").trim();
const validEmail = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email);
if (!validEmail) console.warn("build: SPARROW_SUPPORT_EMAIL is not set. Legal pages will say the contact address isn't configured.");
const contact = validEmail
  ? `<a href="mailto:${email}">${email}</a>`
  : `<span class="contact-missing">the contact address shown here once Sparrow's operator adds it</span>`;
const year = String(new Date().getFullYear());
for (const file of await fs.readdir(DIST)) {
  if (!file.endsWith(".html")) continue;
  const full = path.join(DIST, file);
  const html = await fs.readFile(full, "utf8");
  await fs.writeFile(full, html.replaceAll("{{SUPPORT_CONTACT}}", contact).replaceAll("{{YEAR}}", year));
}

const common = {
  bundle: true,
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  target: ["es2022", "chrome111", "safari16.4", "firefox115"],
  define: { "process.env.NODE_ENV": '"production"' },
  external: ["/fonts/*", "/images/*", "fs", "path", "url", "module", "canvas", "http", "https", "zlib", "stream", "node:*"],
};

const app = await build({
  ...common,
  entryPoints: { app: at("sparrow", "src", "main.jsx") },
  outdir: DIST,
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  jsx: "automatic",
  jsxImportSource: "preact",
  metafile: true,
});

const site = await build({
  ...common,
  entryPoints: { landing: at("sparrow", "src", "landing", "landing.js"), site: at("sparrow", "src", "styles", "site.css") },
  outdir: DIST,
  format: "esm",
  metafile: true,
});

// The API runs as plain Node modules; catch syntax errors before deploying.
const serverFiles = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith(".mjs")) serverFiles.push(full);
  }
}
await walk(at("server"));
await walk(at("shared"));
for (const file of serverFiles) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });

const size = (meta, name) => {
  const out = Object.entries(meta.outputs).find(([p]) => p.endsWith(name));
  return out ? `${(out[1].bytes / 1024).toFixed(1)} KB` : "—";
};
console.log(
  `Sparrow build ready: app.js ${size(app.metafile, "app.js")}, app.css ${size(app.metafile, "app.css")}, landing.js ${size(site.metafile, "landing.js")}, site.css ${size(site.metafile, "site.css")}; ${serverFiles.length} server modules checked.`,
);
