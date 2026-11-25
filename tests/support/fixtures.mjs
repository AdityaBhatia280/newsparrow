// Test fixtures: a tiny but valid PDF resume generated in code.
export function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const content = "BT /F1 12 Tf 72 720 Td 16 TL " + lines.map((l) => `(${esc(l)}) Tj T*`).join(" ") + " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export const RESUME_LINES = [
  "Jordan Lee",
  "jordan.lee@example.com | (512) 555-0134 | 123 Oak Street, Austin, TX 78701",
  "ACTIVITIES",
  "Robotics Club - Captain, led the build team for the state championship",
  "Debate Team - Member",
  "AWARDS",
  "Regional science fair finalist",
  "SKILLS",
  "Python, CAD, Spanish",
];
