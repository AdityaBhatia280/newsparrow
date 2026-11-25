// Local server with the same routing as vercel.json: static pages with clean URLs, /app/* → the app shell, /api/* → the API.
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";
import { SECURITY_HEADERS } from "./headers.mjs";

export const DIST = path.resolve(fileURLToPath(new URL("../sparrow/dist/", import.meta.url)));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

export function staticFile(pathname) {
  if (pathname === "/") return "index.html";
  if (pathname === "/app" || pathname.startsWith("/app/")) return "app.html";
  if (!path.extname(pathname)) return pathname.slice(1).replace(/\/$/, "") + ".html";
  return pathname.slice(1);
}

export function createServer(deps = {}) {
  const app = createApp(deps);
  return http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) return app(req, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const file = path.resolve(DIST, staticFile(pathname));
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(404).end("Not found");
      return;
    }
    let data, status = 200, served = file;
    try {
      data = await fs.readFile(file);
    } catch {
      status = 404;
      served = path.join(DIST, "404.html");
      data = await fs.readFile(served).catch(() => Buffer.from("Not found"));
    }
    const ext = path.extname(served);
    res.writeHead(status, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": pathname.startsWith("/fonts/") ? "public, max-age=31536000, immutable" : pathname.startsWith("/images/") ? "public, max-age=86400" : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () => console.log(`Sparrow: http://${host}:${port}`));
}
