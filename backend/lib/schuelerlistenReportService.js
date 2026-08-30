const anmeldeverfahrenModel = require("../models/anmeldeverfahrenModel");
const anmelderundenModel = require("../models/anmelderundenModel");

const REPORT_DEFINITIONS = {
  "alle-schueler": {
    title: "Alle Schueler der aktuellen Runde",
    fileName: "alle-schueler",
    filter: () => true,
  },
  neuaufnahme: {
    title: "Schueler mit Anmeldestatus Neuaufnahme",
    fileName: "neuaufnahmen",
    filter: (row) => row.statusKey === "neuaufnahme",
  },
  "zugeordnete-schueler": {
    title: "Zugeordnete Schueler",
    fileName: "zugeordnete-schueler",
    filter: (row) => ["zugeordnet", "zuordnung"].includes(row.statusKey),
  },
  "ohne-anmeldung": {
    title: "Schueler ohne Anmeldung",
    fileName: "ohne-anmeldung",
    filter: (row) => ["", "ohne"].includes(row.statusKey),
  },
  "nach-zielschule": {
    title: "Schueler nach Zielschule mit Herkunftsschule",
    fileName: "schueler-nach-zielschule",
    filter: () => true,
    sortByTargetSchool: true,
  },
  foerderbedarf: {
    title: "Schueler mit Foerderbedarf",
    fileName: "schueler-foerderbedarf",
    filter: (row) => row.hatFoerderbedarf,
  },
};

function normalizeText(value) {
  return String(value ?? "").trim();
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
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text;
}

function formatTimestampDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function isPositiveFlag(value) {
  const normalized = normalizeText(value).toLowerCase();
  return !!normalized && !["0", "false", "nein", "no"].includes(normalized);
}

async function loadTableColumns(pool, tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((rows || []).map((row) => normalizeText(row?.Field)).filter(Boolean));
}

function compareNames(left, right) {
  const surnameCompare = left.nachname.localeCompare(right.nachname, "de", { numeric: true });
  if (surnameCompare !== 0) return surnameCompare;
  const firstnameCompare = left.vorname.localeCompare(right.vorname, "de", { numeric: true });
  if (firstnameCompare !== 0) return firstnameCompare;
  return left.interne_schueler_id - right.interne_schueler_id;
}

async function buildSchuelerlisteReport(pool, verfahrenId, rundeId, auswertung) {
  const definition = REPORT_DEFINITIONS[normalizeText(auswertung)];
  if (!definition) {
    const error = new Error("Schuelerliste nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

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
    return { definition, procedure, round, generated_at: formatTimestampDate(new Date()), rows: [] };
  }
  const sourceSchoolColumn = studentColumns.has("herkunftsschule_snr")
    ? "s.herkunftsschule_snr"
    : (studentColumns.has("snr") ? "s.snr" : "''");
  const supportColumn = studentColumns.has("foerderbedarf") ? "s.foerderbedarf" : "''";
  const differentGoalColumn = studentColumns.has("zieldifferent") ? "s.zieldifferent" : "''";
  const noteColumn = studentColumns.has("notiz") ? "s.notiz" : "''";

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, 0) AS interne_schueler_id,
      COALESCE(NULLIF(TRIM(x.externe_id), ''), '') AS externe_schueler_id,
      COALESCE(NULLIF(TRIM(s.nachname), ''), '') AS nachname,
      COALESCE(NULLIF(TRIM(s.vorname), ''), '') AS vorname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(NULLIF(TRIM(${sourceSchoolColumn}), ''), '') AS abgebende_schule_nr,
      COALESCE(NULLIF(TRIM(src.name), ''), '') AS abgebende_schule_name,
      COALESCE(NULLIF(TRIM(sr.anmeldestatus), ''), '') AS anmeldestatus,
      COALESCE(NULLIF(TRIM(sr.schul_nr), ''), '') AS anmeldeschule_snr,
      COALESCE(NULLIF(TRIM(reg.name), ''), '') AS anmeldeschule_name,
      COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), '') AS koordinierte_snr,
      COALESCE(NULLIF(TRIM(coord.name), ''), '') AS koordinierte_schule_name,
      COALESCE(NULLIF(TRIM(${supportColumn}), ''), '') AS foerderbedarf,
      COALESCE(NULLIF(TRIM(${differentGoalColumn}), ''), '') AS zieldifferent,
      COALESCE(NULLIF(TRIM(${noteColumn}), ''), '') AS bemerkung
    FROM anm_schueler s
    JOIN anm_schueler_runde sr
      ON sr.schueler_id = s.id
     AND sr.verfahren_id = s.verfahren_id
    LEFT JOIN (
      SELECT schueler_id, MIN(NULLIF(TRIM(externe_id), '')) AS externe_id
      FROM anm_schueler_externe_id
      WHERE NULLIF(TRIM(externe_id), '') IS NOT NULL
      GROUP BY schueler_id
      HAVING COUNT(DISTINCT NULLIF(TRIM(externe_id), '')) = 1
    ) x ON x.schueler_id = s.id
    LEFT JOIN anm_schulen src ON src.snr = NULLIF(TRIM(${sourceSchoolColumn}), '')
    LEFT JOIN anm_schulen reg ON reg.snr = NULLIF(TRIM(sr.schul_nr), '')
    LEFT JOIN anm_schulen coord ON coord.snr = NULLIF(TRIM(sr.koordinierte_snr), '')
    WHERE sr.verfahren_id = ?
      AND sr.runde_id = ?
    `,
    [verfahrenId, rundeId],
  );

  const mappedRows = (rows || []).map((row) => {
    const anmeldestatus = normalizeText(row?.anmeldestatus);
    const statusKey = anmeldestatus.toLowerCase();
    const isAssigned = ["zuordnung", "zugeordnet"].includes(statusKey);
    return {
      interne_schueler_id: Number(row?.interne_schueler_id || 0),
      externe_schueler_id: normalizeText(row?.externe_schueler_id),
      nachname: normalizeText(row?.nachname),
      vorname: normalizeText(row?.vorname),
      geburtsdatum: formatDisplayDate(row?.geburtsdatum),
      abgebende_schule_nr: normalizeText(row?.abgebende_schule_nr) || "-",
      abgebende_schule_name: normalizeText(row?.abgebende_schule_name) || "-",
      anmeldestatus: anmeldestatus || "Ohne",
      statusKey,
      schule: isAssigned
        ? (normalizeText(row?.koordinierte_schule_name) || normalizeText(row?.koordinierte_snr) || "-")
        : (normalizeText(row?.anmeldeschule_name) || normalizeText(row?.anmeldeschule_snr) || "-"),
      hatFoerderbedarf: isPositiveFlag(row?.foerderbedarf),
      istZieldifferent: isPositiveFlag(row?.zieldifferent),
      bemerkung: normalizeText(row?.bemerkung) || "-",
    };
  }).filter((row) => row.interne_schueler_id > 0 && definition.filter(row));

  mappedRows.sort((left, right) => {
    if (definition.sortByTargetSchool) {
      const targetCompare = left.schule.localeCompare(right.schule, "de", { numeric: true });
      if (targetCompare !== 0) return targetCompare;
      const sourceCompare = left.abgebende_schule_name.localeCompare(right.abgebende_schule_name, "de", { numeric: true });
      if (sourceCompare !== 0) return sourceCompare;
    }
    return compareNames(left, right);
  });

  return {
    definition,
    procedure,
    round,
    generated_at: formatTimestampDate(new Date()),
    rows: mappedRows.map((row, index) => ({
      lfd_nr: index + 1,
      interne_schueler_id: row.interne_schueler_id,
      externe_schueler_id: row.externe_schueler_id,
      name_vorname: [row.nachname, row.vorname].filter(Boolean).join(", ") || "-",
      geburtsdatum: row.geburtsdatum,
      abgebende_schule_nr: row.abgebende_schule_nr,
      abgebende_schule_name: row.abgebende_schule_name,
      anmeldestatus: row.anmeldestatus,
      schule: row.schule,
      foerderbedarf: row.hatFoerderbedarf ? "Ja" : "Nein",
      zieldifferent: row.istZieldifferent ? "Ja" : "Nein",
      bemerkung: row.bemerkung,
    })),
  };
}

function buildSchuelerlisteCsv(report) {
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
        "Foerderbedarf",
        "ZD",
        "Bemerkung",
      ],
      ...report.rows.map((row) => ([
        row.lfd_nr,
        row.externe_schueler_id || row.interne_schueler_id,
        row.name_vorname,
        row.geburtsdatum,
        row.abgebende_schule_nr,
        row.abgebende_schule_name,
        row.anmeldestatus,
        row.schule,
        row.foerderbedarf,
        row.zieldifferent,
        row.bemerkung,
      ])),
    ],
  };
}

module.exports = {
  REPORT_DEFINITIONS,
  buildSchuelerlisteReport,
  buildSchuelerlisteCsv,
  isPositiveFlag,
  sanitizeFileName,
};
