function normalizeText(value) {
  return String(value ?? "").trim();
}

function formatGermanImportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${day}.${month}.${value.getFullYear()}`;
  }
  const text = normalizeText(value);
  const germanMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (germanMatch) return `${germanMatch[1]}.${germanMatch[2]}.${germanMatch[3]}`;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  const parsed = new Date(text);
  if (text && !Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${day}.${month}.${parsed.getFullYear()}`;
  }
  return text || "-";
}

function buildStammdatenabweichungNote(row, fileName = "") {
  const rowNumber = Number(row?.row_number || 0);
  const changedFields = Array.isArray(row?.changed_fields)
    ? row.changed_fields.filter((field) => ["vorname", "nachname", "geburtsdatum"].includes(String(field)))
    : [];
  const labels = {
    vorname: "Vorname",
    nachname: "Nachname",
    geburtsdatum: "Geburtsdatum",
  };
  const changes = changedFields.map((field) => {
    const formatValue = field === "geburtsdatum" ? formatGermanImportDate : (value) => normalizeText(value) || "-";
    const previousValue = formatValue(row?.existing_data?.[field]);
    const nextValue = formatValue(row?.data?.[field]);
    return `${labels[field] || field}: ${previousValue} -> ${nextValue}`;
  });
  const prefix = rowNumber ? `Zeile ${rowNumber}` : "Import";
  const note = changes.length
    ? `${prefix} | Stammdatenabweichung: ${changes.join(", ")}`
    : `${prefix} | Stammdatenabweichung festgestellt.`;
  const normalizedFileName = normalizeText(fileName);
  return normalizedFileName ? `${note} | Datei: ${normalizedFileName}` : note;
}

module.exports = {
  buildStammdatenabweichungNote,
  formatGermanImportDate,
};
