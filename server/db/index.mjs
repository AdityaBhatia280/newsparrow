// One small query interface over production Postgres (porsager/postgres) and in-process PGlite (tests).
// Pass arrays with pgArray() and objects with JSON.stringify(); cast in SQL ($1::text[], $2::jsonb).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createPostgresDriver(url) {
  let sql = null;
  async function client() {
    if (!sql) {
      const { default: postgres } = await import("postgres");
      const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
      sql = postgres(url, {
        prepare: false, // required by transaction-mode poolers (Neon's pooled URL)
        max: 3,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: local ? false : "require",
        onnotice: () => {},
      });
    }
    return sql;
  }
  const wrap = (s) => ({ query: async (text, params = []) => Array.from(await s.unsafe(text, params)) });
  return {
    async query(text, params = []) {
      return wrap(await client()).query(text, params);
    },
    async tx(fn) {
      const s = await client();
      return s.begin((t) => fn(wrap(t)));
    },
    async exec(text) {
      const s = await client();
      await s.unsafe(text);
    },
    async end() {
      if (sql) await sql.end({ timeout: 5 });
      sql = null;
    },
  };
}

export function createPgliteDriver(pg) {
  const wrap = (t) => ({ query: async (text, params = []) => (await t.query(text, params)).rows });
  return {
    query: (text, params = []) => wrap(pg).query(text, params),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
    exec: async (text) => {
      await pg.exec(text);
    },
    end: () => pg.close(),
  };
}

let shared = null;
/** The production database, created on first use from DATABASE_URL. */
export function defaultDb() {
  if (shared) return shared;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  shared = createPostgresDriver(url);
  return shared;
}

/** A Postgres array literal for a list of strings or numbers. */
export function pgArray(values = []) {
  return "{" + values.map((v) => (typeof v === "number" ? String(v) : '"' + String(v).replace(/(["\\])/g, "\\$1") + '"')).join(",") + "}";
}

const MIGRATIONS = path.resolve(fileURLToPath(new URL("../../db/migrations/", import.meta.url)));

export async function migrate(db, { log = () => {} } = {}) {
  await db.exec("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query("select version from schema_migrations")).map((r) => r.version));
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const text = await fs.readFile(path.join(MIGRATIONS, file), "utf8");
    await db.tx(async (t) => {
      for (const statement of splitStatements(text)) await t.query(statement);
      await t.query("insert into schema_migrations (version) values ($1)", [file]);
    });
    log("applied " + file);
  }
}

// Splits a migration into statements, keeping dollar-quoted blocks intact.
export function splitStatements(text) {
  const out = [];
  let current = "", dollar = false;
  for (const line of text.split(/\r?\n/)) {
    if (!dollar && /^\s*--/.test(line)) continue;
    current += line + "\n";
    const marks = (line.match(/\$\$/g) || []).length;
    if (marks % 2 === 1) dollar = !dollar;
    if (!dollar && /;\s*$/.test(line)) {
      const s = current.trim().replace(/;$/, "");
      if (s) out.push(s);
      current = "";
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
