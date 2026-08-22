import JSZip from "jszip";

export type ParsedWorksheet = {
  headers: string[];
  rows: Array<Record<string, string | number>>;
};

function xml(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("Die Excel-Datei enthaelt ungueltiges XML.");
  return document;
}

function columnIndex(reference: string) {
  const letters = String(reference).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function excelDate(serial: number) {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);
}

function parseStyles(text?: string) {
  if (!text) return new Map<number, string>();
  const document = xml(text);
  const customFormats = new Map<number, string>();
  for (const node of Array.from(document.getElementsByTagName("numFmt"))) {
    customFormats.set(Number(node.getAttribute("numFmtId")), node.getAttribute("formatCode") || "");
  }
  const formats = new Map<number, string>();
  const cellXfs = document.getElementsByTagName("cellXfs")[0];
  const xfs = cellXfs ? Array.from(cellXfs.getElementsByTagName("xf")) : [];
  xfs.forEach((node, index) => {
    const id = Number(node.getAttribute("numFmtId") || 0);
    if ([14, 15, 16, 17, 22, 45, 46, 47].includes(id)) formats.set(index, "date");
    const code = customFormats.get(id) || "";
    if (/[dmy]/i.test(code.replace(/\[[^\]]*\]/g, ""))) formats.set(index, "date");
    else if (/^0+$/.test(code)) formats.set(index, code);
  });
  return formats;
}

export async function readXlsxFile(file: File): Promise<ParsedWorksheet> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Bitte eine Excel-Datei im Format .xlsx auswaehlen.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookFile = zip.file("xl/workbook.xml");
  const relationshipsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationshipsFile) throw new Error("Die Datei ist keine gueltige Excel-Arbeitsmappe.");

  const workbook = xml(await workbookFile.async("text"));
  const firstSheet = workbook.getElementsByTagName("sheet")[0];
  const relationshipId = firstSheet?.getAttribute("r:id");
  if (!relationshipId) throw new Error("Die Excel-Datei enthaelt kein Arbeitsblatt.");
  const relationships = xml(await relationshipsFile.async("text"));
  const relationship = Array.from(relationships.getElementsByTagName("Relationship"))
    .find((node) => node.getAttribute("Id") === relationshipId);
  const target = String(relationship?.getAttribute("Target") || "").replace(/^\//, "");
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error("Das erste Excel-Arbeitsblatt konnte nicht gelesen werden.");

  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sharedFile
    ? Array.from(xml(await sharedFile.async("text")).getElementsByTagName("si"))
      .map((node) => Array.from(node.getElementsByTagName("t")).map((part) => part.textContent || "").join(""))
    : [];
  const stylesFile = zip.file("xl/styles.xml");
  const styles = parseStyles(stylesFile ? await stylesFile.async("text") : undefined);
  const sheet = xml(await sheetFile.async("text"));
  const matrix = Array.from(sheet.getElementsByTagName("row")).map((row) => {
    const cells: Array<string | number> = [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const index = columnIndex(cell.getAttribute("r") || "A1");
      const type = cell.getAttribute("t") || "";
      const raw = cell.getElementsByTagName("v")[0]?.textContent || "";
      let value: string | number = raw;
      if (type === "s") value = sharedStrings[Number(raw)] || "";
      else if (type === "inlineStr") value = Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent || "").join("");
      else if (type === "b") value = raw === "1" ? "Ja" : "Nein";
      else if (raw !== "" && Number.isFinite(Number(raw))) {
        const numeric = Number(raw);
        const format = styles.get(Number(cell.getAttribute("s") || 0));
        if (format === "date") value = excelDate(numeric);
        else if (format && /^0+$/.test(format)) value = String(Math.trunc(numeric)).padStart(format.length, "0");
        else value = numeric;
      }
      cells[index] = value;
    }
    return cells;
  }).filter((row) => row.some((value) => String(value ?? "").trim() !== ""));
  if (matrix.length < 2) throw new Error("Die Excel-Datei enthaelt keine Datenzeilen.");
  const headers = matrix[0].map((value) => String(value ?? "").trim());
  const rows = matrix.slice(1).map((values, index) => {
    const record: Record<string, string | number> = { __row_number: index + 2 };
    headers.forEach((header, cellIndex) => { if (header) record[header] = values[cellIndex] ?? ""; });
    return record;
  });
  return { headers, rows };
}
