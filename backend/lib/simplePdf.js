function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createSimplePdf(lines = [], options = {}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const landscape = options?.landscape === true;
  const pageWidth = landscape ? 842 : 595;
  const pageHeight = landscape ? 595 : 842;
  const marginLeft = Number(options?.marginLeft || 40);
  const marginTop = Number(options?.marginTop || 36);
  const marginBottom = Number(options?.marginBottom || 28);
  const fontSize = Number(options?.fontSize || 12);
  const lineHeight = Number(options?.lineHeight || 18);
  const usableHeight = Math.max(pageHeight - marginTop - marginBottom - lineHeight, lineHeight);
  const linesPerPage = Math.max(1, Math.floor(usableHeight / lineHeight));

  const pageLines = [];
  for (let index = 0; index < safeLines.length; index += linesPerPage) {
    pageLines.push(safeLines.slice(index, index + linesPerPage));
  }
  if (!pageLines.length) pageLines.push([]);

  const contentStreams = pageLines.map((page, pageIndex) => {
    const contentLines = [
      "BT",
      `/F1 ${fontSize} Tf`,
    ];

    page.forEach((line, lineIndex) => {
      const y = pageHeight - marginTop - (lineIndex * lineHeight);
      contentLines.push(`1 0 0 1 ${marginLeft} ${y} Tm (${escapePdfText(line)}) Tj`);
    });

    const footerText = `Seite ${pageIndex + 1} / ${pageLines.length}`;
    contentLines.push(`1 0 0 1 ${marginLeft} ${marginBottom} Tm (${escapePdfText(footerText)}) Tj`);
    contentLines.push("ET");
    return contentLines.join("\n");
  });

  const pageObjectStart = 3;
  const contentObjectStart = pageObjectStart + contentStreams.length;
  const pageKids = contentStreams.map((_, index) => `${pageObjectStart + index} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${contentStreams.length} /Kids [${pageKids}] >>`,
    ...contentStreams.map((_, index) => (
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${contentObjectStart + contentStreams.length} 0 R >> >> /Contents ${contentObjectStart + index} 0 R >>`
    )),
    ...contentStreams.map((stream) => `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

module.exports = {
  createSimplePdf,
};
