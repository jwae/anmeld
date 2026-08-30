const anmeldeverfahrenModel = require("../models/anmeldeverfahrenModel");
const anmelderundenModel = require("../models/anmelderundenModel");

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
  const dateTimeMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/);
  if (!dateTimeMatch) return text;
  const date = `${dateTimeMatch[3]}.${dateTimeMatch[2]}.${dateTimeMatch[1]}`;
  return dateTimeMatch[4] ? `${date} ${dateTimeMatch[4]}:${dateTimeMatch[5]}` : date;
}

function formatTimestampDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

async function loadTableColumns(pool, tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((rows || []).map((row) => normalizeText(row?.Field)).filter(Boolean));
}

function mapOpenCaseRow(row, index) {
  return {
    lfd_nr: index + 1,
    fall_id: Number(row?.fall_id || 0),
    externe_schueler_id: normalizeText(row?.externe_schueler_id) || "-",
    name_vorname: [normalizeText(row?.nachname), normalizeText(row?.vorname)].filter(Boolean).join(", ") || "-",
    geburtsdatum: formatDisplayDate(row?.geburtsdatum),
    aktuelle_snr: normalizeText(row?.aktuelle_snr) || "-",
    aktuelle_schule: normalizeText(row?.aktuelle_schule) || "-",
    erwartete_snr: normalizeText(row?.erwartete_snr) || "-",
    erwartete_schule: normalizeText(row?.erwartete_schule) || "-",
    zugewiesene_snr: normalizeText(row?.zugewiesene_snr) || "-",
    zugewiesene_schule: normalizeText(row?.zugewiesene_schule) || "-",
    fallgrund_code: normalizeText(row?.fallgrund_code) || "-",
    fallgrund: normalizeText(row?.fallgrund) || "-",
    fallstatus: normalizeText(row?.fallstatus) || "-",
    bemerkung: normalizeText(row?.bemerkung) || "-",
    aktualisiert: formatDisplayDate(row?.updated_at || row?.created_at),
  };
}

async function buildOffeneFaelleReport(pool, verfahrenId, rundeId) {
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

  const caseColumns = await loadTableColumns(pool, "anm_offener_fall");
  if (!caseColumns.size) {
    return { procedure, round, generated_at: formatTimestampDate(new Date()), rows: [] };
  }
  const expectedSchoolExpression = `(
    SELECT prev_sr.schul_nr
    FROM anm_schueler_runde prev_sr
    JOIN anm_runde prev_r ON prev_r.id = prev_sr.runde_id
    JOIN anm_runde current_r ON current_r.id = sr.runde_id
    WHERE prev_sr.verfahren_id = sr.verfahren_id
      AND prev_sr.schueler_id = sr.schueler_id
      AND prev_r.runden_nummer < current_r.runden_nummer
    ORDER BY prev_r.runden_nummer DESC, prev_sr.id DESC
    LIMIT 1
  )`;

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(f.id, 0) AS fall_id,
      COALESCE(NULLIF(TRIM(s.vorname), ''), '') AS vorname,
      COALESCE(NULLIF(TRIM(s.nachname), ''), '') AS nachname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(NULLIF(TRIM(x.externe_id), ''), '') AS externe_schueler_id,
      COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), NULLIF(TRIM(sr.schul_nr), ''), '') AS aktuelle_snr,
      COALESCE(NULLIF(TRIM(curr.name), ''), '') AS aktuelle_schule,
      COALESCE(NULLIF(TRIM(${expectedSchoolExpression}), ''), NULLIF(TRIM(f.zugewiesene_snr), ''), '') AS erwartete_snr,
      COALESCE(NULLIF(TRIM(expected.name), ''), '') AS erwartete_schule,
      COALESCE(NULLIF(TRIM(f.zugewiesene_snr), ''), '') AS zugewiesene_snr,
      COALESCE(NULLIF(TRIM(assign.name), ''), '') AS zugewiesene_schule,
      COALESCE(NULLIF(TRIM(fg.code), ''), '') AS fallgrund_code,
      COALESCE(NULLIF(TRIM(fg.bezeichnung), ''), NULLIF(TRIM(fg.code), ''), '') AS fallgrund,
      COALESCE(NULLIF(TRIM(fs.bezeichnung), ''), NULLIF(TRIM(fs.code), ''), '') AS fallstatus,
      COALESCE(NULLIF(TRIM(f.bemerkung), ''), '') AS bemerkung,
      DATE_FORMAT(f.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(f.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM anm_offener_fall f
    JOIN anm_schueler s ON s.id = f.schueler_id
    JOIN anm_schueler_runde sr
      ON sr.schueler_id = s.id
     AND sr.verfahren_id = s.verfahren_id
     AND sr.runde_id = ?
    LEFT JOIN (
      SELECT schueler_id, MIN(NULLIF(TRIM(externe_id), '')) AS externe_id
      FROM anm_schueler_externe_id
      WHERE NULLIF(TRIM(externe_id), '') IS NOT NULL
      GROUP BY schueler_id
      HAVING COUNT(DISTINCT NULLIF(TRIM(externe_id), '')) = 1
    ) x ON x.schueler_id = s.id
    LEFT JOIN anm_kat_fallgrund fg ON fg.id = f.fallgrund_id
    LEFT JOIN anm_kat_fallstatus fs ON fs.id = f.fallstatus_id
    LEFT JOIN anm_schulen curr
      ON curr.snr = COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), NULLIF(TRIM(sr.schul_nr), ''))
    LEFT JOIN anm_schulen expected
      ON expected.snr = COALESCE(NULLIF(TRIM(${expectedSchoolExpression}), ''), NULLIF(TRIM(f.zugewiesene_snr), ''))
    LEFT JOIN anm_schulen assign ON assign.snr = f.zugewiesene_snr
    WHERE f.verfahren_id = ?
      AND sr.runde_id = ?
    ORDER BY COALESCE(f.updated_at, f.created_at) DESC, COALESCE(NULLIF(TRIM(s.nachname), ''), '') ASC
    `,
    [rundeId, verfahrenId, rundeId],
  );

  return {
    procedure,
    round,
    generated_at: formatTimestampDate(new Date()),
    rows: (rows || []).map(mapOpenCaseRow),
  };
}

function buildOffeneFaelleCsv(report) {
  return {
    rows: [
      [
        "Lfd. Nr.", "Fall-ID", "Externe Schueler-ID", "Name, Vorname", "Geb.-Dat.",
        "Aktuelle SNR", "Aktuelle Schule", "Erwartete SNR", "Erwartete Schule",
        "Zugewiesene SNR", "Zugewiesene Schule", "Fallgrund-Code", "Fallgrund",
        "Fallstatus", "Bemerkung", "Aktualisiert",
      ],
      ...report.rows.map((row) => ([
        row.lfd_nr, row.fall_id, row.externe_schueler_id, row.name_vorname, row.geburtsdatum,
        row.aktuelle_snr, row.aktuelle_schule, row.erwartete_snr, row.erwartete_schule,
        row.zugewiesene_snr, row.zugewiesene_schule, row.fallgrund_code, row.fallgrund,
        row.fallstatus, row.bemerkung, row.aktualisiert,
      ])),
    ],
  };
}

module.exports = {
  buildOffeneFaelleReport,
  buildOffeneFaelleCsv,
  mapOpenCaseRow,
  sanitizeFileName,
};
