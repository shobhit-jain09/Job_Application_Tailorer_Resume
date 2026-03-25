let JSZip;
let DOMParser;
let XMLSerializer;
let xpath;

try {
  JSZip = require("jszip");
  ({ DOMParser, XMLSerializer } = require("@xmldom/xmldom"));
  xpath = require("xpath");
} catch (err) {
  const missing = err?.code === "MODULE_NOT_FOUND" ? err?.message : String(err?.message || err);
  throw new Error(
    `DOCX in-place tailoring dependencies missing. Run "npm install" in the project root.\n` +
      `Original error: ${missing}`,
  );
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const selectW = xpath.useNamespaces({ w: W_NS });

function normalizeLine(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphText(p) {
  const nodes = selectW(".//w:t", p);
  const text = nodes.map((n) => n.textContent || "").join("");
  return normalizeLine(text);
}

function paragraphHasNumbering(p) {
  const numPr = selectW(".//w:numPr", p);
  return Boolean(numPr && numPr.length);
}

function setParagraphText(doc, p, text) {
  const tNodes = selectW(".//w:t", p);
  const safe = String(text ?? "");

  if (tNodes.length > 0) {
    tNodes[0].textContent = safe;
    for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = "";
    return;
  }

  // Create minimal run if paragraph has no text nodes.
  const r = doc.createElementNS(W_NS, "w:r");
  const t = doc.createElementNS(W_NS, "w:t");
  t.appendChild(doc.createTextNode(safe));
  r.appendChild(t);
  p.appendChild(r);
}

function parseTailoredResumeSections(tailoredResumeText) {
  const raw = String(tailoredResumeText || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n").map((l) => l.trimEnd());

  const headings = new Set([
    "TARGET ROLE",
    "PROFESSIONAL SUMMARY",
    "KEY SKILLS",
    "SELECTED IMPACT",
    "EDUCATION",
    "PROFESSIONAL EXPERIENCE",
    "CORE SKILLS",
    "SUMMARY",
  ]);

  const sections = {};
  let current = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const maybeHeading = normalizeLine(t).toUpperCase();
    if (headings.has(maybeHeading)) {
      current = maybeHeading;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (!current) continue;
    sections[current].push(t);
  }

  const summaryLines =
    sections["PROFESSIONAL SUMMARY"] ||
    sections["SUMMARY"] ||
    [];

  const skillsLines =
    sections["KEY SKILLS"] ||
    sections["CORE SKILLS"] ||
    [];

  const impactLines =
    sections["SELECTED IMPACT"] ||
    sections["PROFESSIONAL EXPERIENCE"] ||
    [];

  const bullets = impactLines
    .map((l) => l.replace(/^\s*[-•]\s+/, "").trim())
    .filter((l) => l.length >= 10);

  return {
    summary: summaryLines.filter(Boolean).slice(0, 3).join(" "),
    skillsLines: skillsLines.filter(Boolean).slice(0, 10),
    bullets: bullets.slice(0, 10),
  };
}

function findSectionRange(paragraphs, headingVariants) {
  const isHeading = (txt) =>
    headingVariants.some((v) => normalizeLine(txt).toUpperCase() === normalizeLine(v).toUpperCase());

  const headingIdx = paragraphs.findIndex((p) => isHeading(paragraphText(p)));
  if (headingIdx === -1) return null;

  // Range ends at the next ALL CAPS heading-like paragraph.
  let end = paragraphs.length;
  for (let i = headingIdx + 1; i < paragraphs.length; i++) {
    const t = paragraphText(paragraphs[i]);
    if (!t) continue;
    const looksHeading = /^[A-Z0-9][A-Z0-9 \/\-]{2,}$/.test(t) && t.length <= 40;
    if (looksHeading) {
      end = i;
      break;
    }
  }

  return { headingIdx, start: headingIdx + 1, end };
}

function replaceSectionParagraphs(doc, paragraphs, range, newLines, { preferBullets = false } = {}) {
  if (!range) return;
  const parent = paragraphs[range.headingIdx].parentNode;

  // Collect existing paragraphs in the section.
  const existing = paragraphs.slice(range.start, range.end);

  const lines = (newLines || []).map((l) => String(l || "").trim()).filter(Boolean);
  if (!lines.length) return;

  const applyLineToParagraph = (p, line) => {
    const cleaned = preferBullets ? line.replace(/^\s*[-•]\s+/, "") : line;
    setParagraphText(doc, p, cleaned);
  };

  // If section has zero paragraphs, insert one by cloning the heading paragraph.
  if (existing.length === 0) {
    const clone = paragraphs[range.headingIdx].cloneNode(true);
    // Clear text style by keeping paragraph properties but changing text.
    applyLineToParagraph(clone, lines[0]);
    const refNode = paragraphs[range.end] || null;
    parent.insertBefore(clone, refNode);
    return;
  }

  // If bullets requested, try to map lines to existing bullet/numbered paragraphs first.
  if (preferBullets) {
    const bulletParas = existing.filter((p) => paragraphHasNumbering(p) || paragraphText(p).startsWith("-"));
    const target = bulletParas.length ? bulletParas : existing;

    for (let i = 0; i < target.length; i++) {
      if (i < lines.length) applyLineToParagraph(target[i], lines[i]);
      else setParagraphText(doc, target[i], "");
    }

    // Add additional paragraphs if we need more bullets than exist.
    if (lines.length > target.length) {
      const templateP = target[target.length - 1] || existing[existing.length - 1];
      const refNode = paragraphs[range.end] || null;
      for (let i = target.length; i < lines.length; i++) {
        const clone = templateP.cloneNode(true);
        applyLineToParagraph(clone, lines[i]);
        parent.insertBefore(clone, refNode);
      }
    }

    return;
  }

  // Non-bullets: replace first paragraph; clear the rest.
  applyLineToParagraph(existing[0], lines[0]);
  for (let i = 1; i < existing.length; i++) setParagraphText(doc, existing[i], "");
}

async function applyTailoringToDocxTemplate({ docxBuffer, tailoredResumeText }) {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("DOCX missing word/document.xml");

  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, "application/xml");
  const paragraphs = selectW("//w:p", doc);
  if (!paragraphs?.length) throw new Error("No paragraphs found in DOCX");

  const content = parseTailoredResumeSections(tailoredResumeText);

  const summaryRange = findSectionRange(paragraphs, [
    "PROFESSIONAL SUMMARY",
    "SUMMARY",
    "PROFILE",
    "ABOUT",
  ]);
  const skillsRange = findSectionRange(paragraphs, [
    "KEY SKILLS",
    "CORE SKILLS",
    "SKILLS",
    "TECHNICAL SKILLS",
    "TOOLS",
  ]);
  const expRange = findSectionRange(paragraphs, [
    "SELECTED IMPACT",
    "PROFESSIONAL EXPERIENCE",
    "EXPERIENCE",
    "WORK EXPERIENCE",
  ]);

  // Summary: one paragraph.
  if (content.summary) {
    replaceSectionParagraphs(doc, paragraphs, summaryRange, [content.summary], { preferBullets: false });
  }

  // Skills: keep the user's section; use a few compact lines.
  if (content.skillsLines?.length) {
    replaceSectionParagraphs(doc, paragraphs, skillsRange, content.skillsLines, { preferBullets: false });
  }

  // Experience/Impact bullets: preserve bullet formatting by reusing numbered/bulleted paragraphs.
  if (content.bullets?.length) {
    replaceSectionParagraphs(
      doc,
      paragraphs,
      expRange,
      content.bullets.map((b) => `- ${b}`),
      { preferBullets: true },
    );
  }

  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(doc);
  zip.file("word/document.xml", updatedXml);

  const outBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return outBuffer;
}

module.exports = {
  applyTailoringToDocxTemplate,
};

