export type CsvParseOptions = {
  delimiter: "auto" | ";" | "," | "\t";
  hasHeaders: boolean;
  charset: "utf-8";
};

export type ParsedCsvRow = {
  rowNumber: number;
  values: string[];
  record: Record<string, string>;
};

export type ParsedCsvResult = {
  columns: string[];
  rows: ParsedCsvRow[];
  previewRows: string[][];
  delimiter: ";" | "," | "\t";
};

export const CSV_PREVIEW_ROW_LIMIT = 15;

function normalizeCsvLineBreaks(text: string) {
  return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitCsvLine(line: string, delimiter: ";" | "," | "\t") {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function countDelimiter(line: string, delimiter: ";" | "," | "\t") {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(lines: string[]) {
  const sample = lines.find((line) => String(line || "").trim()) || "";
  const candidates: Array<";" | "," | "\t"> = [";", ",", "\t"];
  let selected: ";" | "," | "\t" = ";";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = countDelimiter(sample, candidate);
    if (count > bestCount) {
      selected = candidate;
      bestCount = count;
    }
  }
  return selected;
}

function normalizeHeaderLabel(value: string, index: number) {
  const text = String(value || "").trim();
  return text || `Spalte ${index + 1}`;
}

export async function readCsvFileText(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (utf8Text.includes("\uFFFD")) {
    try {
      return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch {
      return new TextDecoder("iso-8859-1", { fatal: false }).decode(buffer);
    }
  }
  return utf8Text;
}

export function parseCsvText(text: string, options: CsvParseOptions): ParsedCsvResult {
  const normalized = normalizeCsvLineBreaks(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    throw new Error("Die CSV-Datei ist leer.");
  }

  const delimiter = options.delimiter === "auto" ? detectDelimiter(lines) : options.delimiter;
  const allRows = lines.map((line) => splitCsvLine(line, delimiter));
  const headerValues = options.hasHeaders
    ? allRows[0]
    : Array.from({ length: allRows[0]?.length || 0 }, (_, index) => `Spalte ${index + 1}`);
  const columns = headerValues.map((value, index) => normalizeHeaderLabel(value, index));
  const dataRows = options.hasHeaders ? allRows.slice(1) : allRows;

  const rows = dataRows.map((values, index) => {
    const record = Object.fromEntries(columns.map((column, colIndex) => [column, String(values[colIndex] || "").trim()]));
    return {
      rowNumber: options.hasHeaders ? index + 2 : index + 1,
      values,
      record,
    };
  });

  return {
    columns,
    rows,
    previewRows: dataRows.slice(0, CSV_PREVIEW_ROW_LIMIT),
    delimiter,
  };
}

export function normalizeMappingKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
