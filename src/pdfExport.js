const PDFDocument = require("pdfkit");

function streamTextAsPdf(res, text, filename) {
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 50,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  doc.pipe(res);

  // Use a standard font for ATS-friendly, copyable text.
  doc.font("Helvetica").fontSize(11);
  const safeText = String(text || "");

  // Wrap long lines and preserve newlines.
  // PDFKit handles wrapping when width is specified.
  doc.text(safeText, {
    align: "left",
    width: 500,
  });

  doc.end();
}

module.exports = {
  streamTextAsPdf,
};

