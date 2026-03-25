const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

function getExt(filename) {
  const parts = String(filename || "").toLowerCase().split(".");
  return parts.length >= 2 ? `.${parts[parts.length - 1]}` : "";
}

function cleanExtractedText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function parseResumeBuffer({ buffer, originalname, mimetype }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Missing resume file buffer");
  }

  const ext = getExt(originalname);
  const mt = String(mimetype || "").toLowerCase();

  const isPdf = ext === ".pdf" || mt === "application/pdf";
  const isDocx =
    ext === ".docx" ||
    mt ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isPdf) {
    const out = await pdfParse(buffer);
    const text = cleanExtractedText(out?.text || "");
    if (text.length < 50) throw new Error("Could not extract enough text from PDF");
    return { text, kind: "pdf" };
  }

  if (isDocx) {
    const out = await mammoth.extractRawText({ buffer });
    const text = cleanExtractedText(out?.value || "");
    if (text.length < 50) throw new Error("Could not extract enough text from DOCX");
    return { text, kind: "docx" };
  }

  throw new Error("Unsupported resume type. Upload a PDF or DOCX.");
}

module.exports = {
  parseResumeBuffer,
};

