// npm run db:migrate | npm run db:seed — against DATABASE_URL (loaded from .env by npm scripts).
import { createPostgresDriver, migrate } from "../server/db/index.mjs";
import { seedAll } from "../server/db/seed.mjs";

const command = process.argv[2];
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Set DATABASE_URL (your Neon pooled connection string) in .env first.");
  process.exit(1);
}
const db = createPostgresDriver(url);
try {
  if (command === "migrate") await migrate(db, { log: console.log });
  else if (command === "seed") await seedAll(db, { log: console.log });
  else {
    console.error("Usage: node scripts/db.mjs migrate|seed");
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`db ${command}: done`);
} catch (error) {
  console.error(`db ${command} failed:`, error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
