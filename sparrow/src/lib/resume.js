// Reads a resume in the browser. The file never leaves the device; only text the student reviews is sent.
const MAX_BYTES = 5 * 1024 * 1024;

export async function readResume(file) {
  if (file.size > MAX_BYTES) throw new Error("That file is over 5 MB. Try a smaller PDF, or paste the text instead.");
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith(".pdf") || file.type === "application/pdf") text = await readPdf(file);
  else if (name.endsWith(".docx")) text = await readDocx(file);
  else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) text = await file.text();
  else throw new Error("Use a PDF, a Word file (.docx) or a text file.");
  text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) throw new Error("Sparrow couldn't find text in that file. If it's a scanned image, paste the text instead.");
  return text.slice(0, 20_000);
}

async function readPdf(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  const lines = [];
  try {
    const doc = await task.promise;
    for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = "", lastY = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform?.[5] ?? 0);
        if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) {
          lines.push(line.trim());
          line = "";
        }
        line += (line && !line.endsWith(" ") && item.str && !item.str.startsWith(" ") ? " " : "") + item.str;
        lastY = y;
        if (item.hasEOL) {
          lines.push(line.trim());
          line = "";
          lastY = null;
        }
      }
      if (line.trim()) lines.push(line.trim());
      page.cleanup?.();
    }
  } finally {
    await task.destroy?.();
  }
  return lines.join("\n");
}

async function readDocx(file) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That Word file couldn't be read. Try saving it as a PDF.");
  const doc = new DOMParser().parseFromString(strFromU8(xml), "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const out = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    let text = "";
    for (const node of p.getElementsByTagNameNS(W, "*")) {
      if (node.localName === "t") text += node.textContent;
      else if (node.localName === "tab") text += " ";
      else if (node.localName === "br") text += "\n";
    }
    if (text.trim()) out.push(text.trim());
  }
  return out.join("\n");
}
