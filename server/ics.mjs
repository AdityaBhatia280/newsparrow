// iCalendar (RFC 5545) export of a student's dated tasks and deadlines. All-day events.

const escape = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // never split a UTF-8 character
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

const day = (iso) => iso.replaceAll("-", "");
const nextDay = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
};

export function buildCalendar(events, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sparrow//Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Sparrow plan"];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@newsparrow`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      fold(`SUMMARY:${escape(e.title)}`),
      ...(e.description ? [fold(`DESCRIPTION:${escape(e.description)}`)] : []),
      ...(e.url && /^https:\/\/[^\s"<>]+$/.test(e.url) ? [fold(`URL:${e.url}`)] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
