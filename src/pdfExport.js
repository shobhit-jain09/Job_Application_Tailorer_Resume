const PDFDocument = require("pdfkit");

function streamTextAsPdf(res, text, filename) {
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 50,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  doc.pipe(res);

  const safeText = String(text || "");
  const lines = safeText.replace(/\r\n/g, "\n").split("\n");

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ATS-friendly: standard fonts, clean hierarchy.
  const isAllCapsHeading = (l) => /^[A-Z0-9][A-Z0-9 \/\[\]-]{2,}$/.test(l.trim());
  const isNamePlaceholder = (l) => /^\[YOUR NAME\]$/i.test(l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      doc.moveDown(0.6);
      continue;
    }

    if (isNamePlaceholder(trimmed)) {
      doc.font("Helvetica-Bold").fontSize(16).text(trimmed, { width });
      doc.moveDown(0.2);
      continue;
    }

    if (isAllCapsHeading(trimmed)) {
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(11.5).text(trimmed, { width });
      doc.moveDown(0.1);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      doc.font("Helvetica").fontSize(10.8).text(trimmed, {
        width,
        indent: 10,
        continued: false,
      });
      continue;
    }

    doc.font("Helvetica").fontSize(10.8).text(trimmed, { width });
  }

  doc.end();
}

module.exports = {
  streamTextAsPdf,
};

