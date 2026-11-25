// Builds db/seed/colleges.json from the U.S. Department of Education College Scorecard: four-year, currently operating,
// public and private nonprofit colleges.
//   node scripts/fetch-colleges.mjs --csv <Most-Recent-Cohorts-Institution.csv>   (bulk file from collegescorecard.ed.gov/data)
//   node scripts/fetch-colleges.mjs                                              (API; set DATA_GOV_API_KEY, else DEMO_KEY)
import fs from "node:fs";
import readline from "node:readline";

// College Scorecard "program_percentage" names and their CIP 2-digit columns in the bulk file.
const PROGRAMS = {
  agriculture: "01", resources: "03", architecture: "04", ethnic_cultural_gender: "05", communication: "09",
  communications_technology: "10", computer: "11", personal_culinary: "12", education: "13", engineering: "14",
  engineering_technology: "15", language: "16", family_consumer_science: "19", legal: "22", english: "23", humanities: "24",
  library: "25", biological: "26", mathematics: "27", military: "29", multidiscipline: "30", parks_recreation_fitness: "31",
  philosophy_religious: "38", theology_religious_vocation: "39", physical_science: "40", science_technology: "41",
  psychology: "42", security_law_enforcement: "43", public_administration_social_service: "44", social_science: "45",
  construction: "46", mechanic_repair_technology: "47", precision_production: "48", transportation: "49",
  visual_performing: "50", health: "51", business_marketing: "52", history: "54",
};

const https = (raw) => {
  if (!raw || raw === "NA") return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    u.protocol = "https:";
    return u.href;
  } catch {
    return null;
  }
};
const num = (v) => (v === null || v === undefined || v === "" || v === "NA" || v === "PrivacySuppressed" || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v) => (num(v) === null ? null : Math.round(num(v)));
const shares = (get) => {
  const out = {};
  for (const [name, code] of Object.entries(PROGRAMS)) {
    const v = num(get(name, code));
    if (v !== null && v >= 0.005) out[name] = Math.round(v * 1000) / 1000;
  }
  return out;
};

function parseCsvLine(line) {
  const out = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(field), (field = "");
    else field += c;
  }
  out.push(field);
  return out;
}

async function fromCsv(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header = null, pending = "";
  const colleges = [];
  for await (const raw of lines) {
    const line = pending ? pending + "\n" + raw : raw;
    if ((line.match(/"/g) || []).length % 2) {
      pending = line; // a quoted field continues on the next line
      continue;
    }
    pending = "";
    const cells = parseCsvLine(line);
    if (!header) {
      header = Object.fromEntries(cells.map((name, i) => [name.replace(/^﻿/, ""), i]));
      continue;
    }
    const v = (name) => cells[header[name]];
    if (v("PREDDEG") !== "3" || v("CURROPER") !== "1" || !["1", "2"].includes(v("CONTROL"))) continue;
    colleges.push({
      id: int(v("UNITID")),
      name: v("INSTNM"),
      city: v("CITY") || null,
      state: v("STABBR") || null,
      url: https(v("INSTURL")),
      priceCalculatorUrl: https(v("NPCURL")),
      ownership: int(v("CONTROL")),
      locale: int(v("LOCALE")),
      size: int(v("UGDS")),
      admissionRate: num(v("ADM_RATE")),
      tuitionIn: int(v("TUITIONFEE_IN")),
      tuitionOut: int(v("TUITIONFEE_OUT")),
      netPrice: int(v("CONTROL") === "1" ? v("NPT4_PUB") : v("NPT4_PRIV")),
      completionRate: num(v("C150_4")),
      medianEarnings: int(v("MD_EARN_WNE_P10")),
      programs: shares((_, code) => v("PCIP" + code)),
    });
  }
  return colleges;
}

async function fromApi() {
  const key = process.env.DATA_GOV_API_KEY?.trim() || "DEMO_KEY";
  const fields = [
    "id", "school.name", "school.city", "school.state", "school.school_url", "school.price_calculator_url", "school.ownership",
    "school.locale", "latest.student.size", "latest.admissions.admission_rate.overall", "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state", "latest.cost.avg_net_price.public", "latest.cost.avg_net_price.private",
    "latest.completion.completion_rate_4yr_150nt", "latest.earnings.10_yrs_after_entry.median",
    ...Object.keys(PROGRAMS).map((p) => `latest.academics.program_percentage.${p}`),
  ];
  const colleges = [];
  for (let page = 0, total = Infinity; page * 100 < total; page++) {
    const params = new URLSearchParams({
      api_key: key, per_page: "100", page: String(page), "school.degrees_awarded.predominant": "3",
      "school.operating": "1", "school.ownership": "1,2", fields: fields.join(","),
    });
    const res = await fetch(`https://api.data.gov/ed/collegescorecard/v1/schools?${params}`, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 429) throw new Error("Rate limit reached. Set DATA_GOV_API_KEY (free at api.data.gov) or use --csv with the bulk file.");
    if (!res.ok) throw new Error(`College Scorecard API answered ${res.status}.`);
    const data = await res.json();
    total = data.metadata.total;
    for (const r of data.results)
      colleges.push({
        id: r.id, name: r["school.name"], city: r["school.city"], state: r["school.state"],
        url: https(r["school.school_url"]), priceCalculatorUrl: https(r["school.price_calculator_url"]),
        ownership: r["school.ownership"], locale: r["school.locale"] ?? null, size: int(r["latest.student.size"]),
        admissionRate: num(r["latest.admissions.admission_rate.overall"]), tuitionIn: int(r["latest.cost.tuition.in_state"]),
        tuitionOut: int(r["latest.cost.tuition.out_of_state"]),
        netPrice: int(r["school.ownership"] === 1 ? r["latest.cost.avg_net_price.public"] : r["latest.cost.avg_net_price.private"]),
        completionRate: num(r["latest.completion.completion_rate_4yr_150nt"]), medianEarnings: int(r["latest.earnings.10_yrs_after_entry.median"]),
        programs: shares((name) => r[`latest.academics.program_percentage.${name}`]),
      });
    process.stdout.write(`\rfetched ${colleges.length} of ${total}`);
  }
  return colleges;
}

const csvAt = process.argv.indexOf("--csv");
const colleges = csvAt > 0 ? await fromCsv(process.argv[csvAt + 1]) : await fromApi();
const valid = colleges.filter((c) => c.id && c.name && c.state && (c.size ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name));
fs.mkdirSync(new URL("../db/seed/", import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL("../db/seed/colleges.json", import.meta.url),
  JSON.stringify({
    source: "U.S. Department of Education College Scorecard",
    sourceUrl: "https://collegescorecard.ed.gov/data/",
    retrieved: new Date().toISOString().slice(0, 10),
    colleges: valid,
  }) + "\n",
);
console.log(`\nwrote ${valid.length} colleges to db/seed/colleges.json`);
