// Loads the curated catalog and the College Scorecard snapshot. Safe to run repeatedly:
// a reviewer's verified edits to an opportunity are never overwritten by the seed file.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pgArray } from "./index.mjs";

const SEED = (name) => fileURLToPath(new URL(`../../db/seed/${name}`, import.meta.url));

export async function readSeed(name) {
  return JSON.parse(await fs.readFile(SEED(name), "utf8"));
}

export async function seedOpportunities(db, items) {
  let count = 0;
  for (const o of items) {
    await db.query(
      `insert into opportunities (slug, title, provider, type, interests, grades, format, location, cost, summary, official_url, link_checked_at)
       values ($1, $2, $3, $4, $5::text[], $6::smallint[], $7, $8, $9, $10, $11, $12::timestamptz)
       on conflict (slug) do update set title = excluded.title, provider = excluded.provider, type = excluded.type,
         interests = excluded.interests, grades = excluded.grades, format = excluded.format, location = excluded.location,
         cost = excluded.cost, summary = excluded.summary, official_url = excluded.official_url,
         link_checked_at = coalesce(excluded.link_checked_at, opportunities.link_checked_at), updated_at = now()
       where opportunities.facts_verified_at is null`,
      [
        o.slug, o.title, o.provider, o.type, pgArray(o.interests || []), pgArray(o.grades || []), o.format || "varies",
        o.location || null, o.cost || "unknown", o.summary, o.officialUrl, o.linkCheckedAt || null,
      ],
    );
    count++;
  }
  return count;
}

export async function seedColleges(db, snapshot) {
  const retrieved = snapshot.retrieved;
  let count = 0;
  for (const c of snapshot.colleges) {
    await db.query(
      `insert into colleges (id, name, city, state, url, price_calculator_url, ownership, locale, size, admission_rate,
         tuition_in, tuition_out, net_price, completion_rate, median_earnings, program_shares, source_retrieved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::date)
       on conflict (id) do update set name = excluded.name, city = excluded.city, state = excluded.state, url = excluded.url,
         price_calculator_url = excluded.price_calculator_url, ownership = excluded.ownership, locale = excluded.locale,
         size = excluded.size, admission_rate = excluded.admission_rate, tuition_in = excluded.tuition_in,
         tuition_out = excluded.tuition_out, net_price = excluded.net_price, completion_rate = excluded.completion_rate,
         median_earnings = excluded.median_earnings, program_shares = excluded.program_shares,
         source_retrieved_at = excluded.source_retrieved_at`,
      [
        c.id, c.name, c.city, c.state, c.url, c.priceCalculatorUrl, c.ownership, c.locale, c.size, c.admissionRate,
        c.tuitionIn, c.tuitionOut, c.netPrice, c.completionRate, c.medianEarnings, JSON.stringify(c.programs || {}), retrieved,
      ],
    );
    count++;
  }
  return count;
}

export async function seedAll(db, { log = () => {} } = {}) {
  const opportunities = await readSeed("opportunities.json");
  log(`opportunities: ${await seedOpportunities(db, opportunities.items)}`);
  try {
    const colleges = await readSeed("colleges.json");
    log(`colleges: ${await seedColleges(db, colleges)}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    log("colleges: no snapshot yet (run npm run colleges:fetch)");
  }
}
