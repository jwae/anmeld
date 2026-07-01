const anmeldeverfahrenModel = require("../models/anmeldeverfahrenModel");
const anmelderundenModel = require("../models/anmelderundenModel");

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeFileName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "auswertung";
}

function formatDisplayDate(value) {
  const text = normalizeText(value);
  if (!text) return "-";
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatTimestampDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return formatDisplayDate(new Date());
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function normalizeOpenStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "zuordnung" || normalized === "zugeordnet") return "Zuordnung";
  if (normalized === "warteliste") return "Warteliste";
  if (normalized === "ohne") return "Ohne";
  return "";
}

function openStatusSortRank(value) {
  if (value === "Zuordnung") return 1;
  if (value === "Warteliste") return 2;
  if (value === "Ohne") return 3;
  return 99;
}

async function loadTableColumns(pool, tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((rows || []).map((row) => String(row?.Field || "").trim()).filter(Boolean));
}

async function buildOffeneAnmeldungenReport(pool, verfahrenId, rundeId) {
  const procedure = await anmeldeverfahrenModel.findById(pool, verfahrenId);
  if (!procedure) {
    const error = new Error("Anmeldeverfahren nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

  const round = await anmelderundenModel.findById(pool, rundeId);
  if (!round || Number(round.verfahren_id) !== Number(verfahrenId)) {
    const error = new Error("Anmelderunde nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

  const studentColumns = await loadTableColumns(pool, "anm_schueler");
  if (!studentColumns.size) {
    return {
      procedure,
      round,
      generated_at: formatTimestampDate(new Date()),
      rows: [],
    };
  }

  const studentIdColumn = studentColumns.has("schueler_id")
    ? "s.schueler_id"
    : (studentColumns.has("schueler_nr") ? "s.schueler_nr" : "''");
  const sourceSchoolColumn = studentColumns.has("quell_snr")
    ? "s.quell_snr"
    : (studentColumns.has("snr") ? "s.snr" : "''");
  const targetSchoolColumn = studentColumns.has("schul_nr")
    ? "s.schul_nr"
    : (studentColumns.has("snr") ? "s.snr" : "''");
  const noteColumn = studentColumns.has("bemerkung")
    ? "COALESCE(NULLIF(TRIM(s.bemerkung), ''), '')"
    : "''";

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(${studentIdColumn}), ''), '') AS schueler_id,
      COALESCE(NULLIF(TRIM(s.nachname), ''), '') AS nachname,
      COALESCE(NULLIF(TRIM(s.vorname), ''), '') AS vorname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(NULLIF(TRIM(${sourceSchoolColumn}), ''), '') AS abgebende_schule_nr,
      COALESCE(NULLIF(TRIM(src.name), ''), '') AS abgebende_schule_name,
      COALESCE(NULLIF(TRIM(s.anmeldestatus), ''), '') AS anmeldestatus,
      COALESCE(NULLIF(TRIM(${targetSchoolColumn}), ''), '') AS schule_nr,
      COALESCE(NULLIF(TRIM(dst.name), ''), '') AS schule_name,
      ${noteColumn} AS bemerkung
    FROM anm_schueler s
    LEFT JOIN anm_schulen src
      ON src.snr = NULLIF(TRIM(${sourceSchoolColumn}), '')
    LEFT JOIN anm_schulen dst
      ON dst.snr = NULLIF(TRIM(${targetSchoolColumn}), '')
    WHERE s.verfahren_id = ?
      AND s.runde_id = ?
    `,
    [verfahrenId, rundeId],
  );

  const filteredRows = (rows || [])
    .map((row) => {
      const normalizedStatus = normalizeOpenStatus(row?.anmeldestatus);
      return {
        schueler_id: normalizeText(row?.schueler_id),
        nachname: normalizeText(row?.nachname),
        vorname: normalizeText(row?.vorname),
        geburtsdatum: formatDisplayDate(row?.geburtsdatum),
        abgebende_schule_nr: normalizeText(row?.abgebende_schule_nr) || "-",
        abgebende_schule_name: normalizeText(row?.abgebende_schule_name) || "-",
        anmeldestatus: normalizedStatus,
        schule: normalizeText(row?.schule_name) || normalizeText(row?.schule_nr) || "-",
        bemerkung: normalizeText(row?.bemerkung) || "-",
      };
    })
    .filter((row) => row.schueler_id && ["Zuordnung", "Warteliste", "Ohne"].includes(row.anmeldestatus))
    .sort((left, right) => {
      const statusCompare = openStatusSortRank(left.anmeldestatus) - openStatusSortRank(right.anmeldestatus);
      if (statusCompare !== 0) return statusCompare;
      const surnameCompare = String(left.nachname || "").localeCompare(String(right.nachname || ""), "de", { numeric: true });
      if (surnameCompare !== 0) return surnameCompare;
      const firstnameCompare = String(left.vorname || "").localeCompare(String(right.vorname || ""), "de", { numeric: true });
      if (firstnameCompare !== 0) return firstnameCompare;
      return String(left.schueler_id || "").localeCompare(String(right.schueler_id || ""), "de", { numeric: true });
    })
    .map((row, index) => ({
      lfd_nr: index + 1,
      schueler_id: row.schueler_id,
      name_vorname: [row.nachname, row.vorname].filter(Boolean).join(", ") || "-",
      geburtsdatum: row.geburtsdatum,
      abgebende_schule_nr: row.abgebende_schule_nr,
      abgebende_schule_name: row.abgebende_schule_name,
      anmeldestatus: row.anmeldestatus,
      schule: row.schule,
      bemerkung: row.bemerkung,
    }));

  return {
    procedure,
    round,
    generated_at: formatTimestampDate(new Date()),
    rows: filteredRows,
  };
}

function buildOffeneAnmeldungenCsv(report) {
  return {
    rows: [
      [
        "Lfd. Nr.",
        "Schueler-ID",
        "Name, Vorname",
        "Geb.-Dat.",
        "Nr. abg. Schule",
        "Name abgebende Schule",
        "Anmeldestatus",
        "Schule",
        "Bemerkung",
      ],
      ...report.rows.map((row) => ([
        row.lfd_nr,
        row.schueler_id,
        row.name_vorname,
        row.geburtsdatum,
        row.abgebende_schule_nr,
        row.abgebende_schule_name,
        row.anmeldestatus,
        row.schule,
        row.bemerkung,
      ])),
    ],
    fileName: `offene_anmeldungen_runde_${report.round.runden_nummer}`,
  };
}

function buildOffeneAnmeldungenPdfLines(report) {
  const lines = [
    "Schueler mit offenem Anmeldestatus",
    `Verfahren: ${report.procedure.bezeichnung || "-"}`,
    `Runde: ${report.round.bezeichnung || `Runde ${report.round.runden_nummer}`}`,
    `Erstellt am: ${report.generated_at}`,
    `Datensaetze: ${report.rows.length}`,
    "",
    "Lfd | Schueler-ID | Name | Geb.-Dat. | Nr. abg. Schule | Name abg. Schule | Anmeldestatus | Schule | Bemerkung",
    ...report.rows.map((row) => ([
      row.lfd_nr,
      row.schueler_id,
      row.name_vorname,
      row.geburtsdatum,
      row.abgebende_schule_nr,
      row.abgebende_schule_name,
      row.anmeldestatus,
      row.schule,
      row.bemerkung,
    ].join(" | "))),
  ];

  return {
    lines,
    fileName: `offene_anmeldungen_runde_${report.round.runden_nummer}`,
  };
}

module.exports = {
  buildOffeneAnmeldungenReport,
  buildOffeneAnmeldungenCsv,
  buildOffeneAnmeldungenPdfLines,
  sanitizeFileName,
};
