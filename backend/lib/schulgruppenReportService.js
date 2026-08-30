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

function formatTimestampDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function mapSchoolGroupRow(row) {
  const gesamtkapazitaet = Number(row?.gesamtkapazitaet || 0);
  const anmeldungenGesamt = Number(row?.anmeldungen_gesamt || 0);

  return {
    snr: normalizeText(row?.snr),
    schule: normalizeText(row?.schule) || "-",
    jahrgang: normalizeText(row?.jahrgang) || "-",
    gesamtkapazitaet,
    maximale_klassen: Number(row?.maximale_klassen || 0),
    anmeldungen_gesamt: anmeldungenGesamt,
    freie_plaetze: gesamtkapazitaet - anmeldungenGesamt,
    warteliste: Number(row?.warteliste || 0),
    le: Number(row?.le || 0),
    zd: Number(row?.zd || 0),
  };
}

function mapSchoolGroupAssignmentRow(row) {
  return {
    rolle: normalizeText(row?.rolle) || "-",
    schulgruppe: normalizeText(row?.schulgruppe) || "-",
    beschreibung: normalizeText(row?.beschreibung) || "-",
    aktiv: Number(row?.aktiv || 0) === 1 ? "Ja" : "Nein",
    snr: normalizeText(row?.snr) || "-",
    schule: normalizeText(row?.schule) || "-",
  };
}

async function buildSchulgruppenAssignmentReport(pool, verfahrenId, rundeId) {
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

  const [rows] = await pool.query(
    `
    SELECT
      vsg.rolle,
      sg.name AS schulgruppe,
      sg.beschreibung,
      sg.aktiv,
      sgs.snr,
      s.name AS schule
    FROM anm_verfahren_schulgruppe vsg
    JOIN anm_schulgruppe sg
      ON sg.id = vsg.schulgruppe_id
    LEFT JOIN anm_schulgruppe_schule sgs
      ON sgs.schulgruppe_id = sg.id
    LEFT JOIN anm_schulen s
      ON s.snr = sgs.snr
    WHERE vsg.verfahren_id = ?
    ORDER BY
      CASE vsg.rolle
        WHEN 'Quellschulen' THEN 1
        WHEN 'Zielschulen' THEN 2
        ELSE 9
      END,
      sg.name ASC,
      COALESCE(NULLIF(TRIM(s.name), ''), '-') ASC,
      sgs.snr ASC
    `,
    [verfahrenId],
  );

  return {
    procedure,
    round,
    generated_at: formatTimestampDate(new Date()),
    rows: (rows || []).map(mapSchoolGroupAssignmentRow),
  };
}

async function buildSchulgruppenReport(pool, verfahrenId, rundeId) {
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

  const [rows] = await pool.query(
    `
    SELECT
      s.snr,
      COALESCE(NULLIF(TRIM(s.name), ''), '-') AS schule,
      COALESCE(cap.jahrgang, '-') AS jahrgang,
      COALESCE(cap.gesamtkapazitaet, 0) AS gesamtkapazitaet,
      COALESCE(cap.maximale_klassen, 0) AS maximale_klassen,
      COALESCE(st.anmeldungen_gesamt, 0) AS anmeldungen_gesamt,
      COALESCE(st.warteliste, 0) AS warteliste,
      COALESCE(st.le, 0) AS le,
      COALESCE(st.zd, 0) AS zd
    FROM (
      SELECT DISTINCT sgs.snr
      FROM anm_verfahren_schulgruppe vsg
      JOIN anm_schulgruppe_schule sgs
        ON sgs.schulgruppe_id = vsg.schulgruppe_id
      WHERE vsg.verfahren_id = ?
        AND vsg.rolle = 'Zielschulen'
    ) beteiligt
    JOIN anm_schulen s
      ON s.snr = beteiligt.snr
    LEFT JOIN (
      SELECT
        k.snr,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(k.jahrgang), '') ORDER BY k.jahrgang SEPARATOR ', ') AS jahrgang,
        SUM(COALESCE(k.gesamtkapazitaet, 0)) AS gesamtkapazitaet,
        SUM(COALESCE(k.maximale_klassen, 0)) AS maximale_klassen
      FROM anm_kapazitaet k
      WHERE k.verfahren_id = ?
      GROUP BY k.snr
    ) cap
      ON cap.snr = s.snr
    LEFT JOIN (
      SELECT
        CASE
          WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) IN ('zugeordnet', 'zuordnung')
            THEN COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), NULLIF(TRIM(sr.schul_nr), ''))
          ELSE NULLIF(TRIM(sr.schul_nr), '')
        END AS snr,
        COUNT(*) AS anmeldungen_gesamt,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) = 'warteliste' THEN 1 ELSE 0 END) AS warteliste,
        SUM(CASE
          WHEN TRIM(COALESCE(sch.foerderbedarf, '')) = '' THEN 0
          WHEN LOWER(TRIM(COALESCE(sch.foerderbedarf, ''))) IN ('0', 'false', 'nein', 'no') THEN 0
          ELSE 1
        END) AS le,
        SUM(CASE
          WHEN LOWER(TRIM(COALESCE(sch.zieldifferent, '0'))) IN ('1', 'true', 'ja', 'yes') THEN 1
          ELSE 0
        END) AS zd
      FROM anm_schueler_runde sr
      JOIN anm_schueler sch
        ON sch.id = sr.schueler_id
       AND sch.verfahren_id = sr.verfahren_id
      WHERE sr.verfahren_id = ?
        AND sr.runde_id = ?
        AND LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) NOT IN ('', 'ohne')
      GROUP BY CASE
        WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) IN ('zugeordnet', 'zuordnung')
          THEN COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), NULLIF(TRIM(sr.schul_nr), ''))
        ELSE NULLIF(TRIM(sr.schul_nr), '')
      END
    ) st
      ON st.snr = s.snr
    ORDER BY COALESCE(NULLIF(TRIM(s.name), ''), '-') ASC, s.snr ASC
    `,
    [verfahrenId, verfahrenId, verfahrenId, rundeId],
  );

  return {
    procedure,
    round,
    generated_at: formatTimestampDate(new Date()),
    rows: (rows || []).map(mapSchoolGroupRow),
  };
}

function buildSchulgruppenCsv(report) {
  return {
    rows: [
      [
        "SNR",
        "Schule",
        "Jahrgang",
        "Gesamt-Kapazitaet",
        "Max. Klassen",
        "Anmeldungen-Gesamt",
        "Freie Plaetze",
        "Warteliste",
        "LE",
        "ZD",
      ],
      ...report.rows.map((row) => ([
        row.snr,
        row.schule,
        row.jahrgang,
        row.gesamtkapazitaet,
        row.maximale_klassen,
        row.anmeldungen_gesamt,
        row.freie_plaetze,
        row.warteliste,
        row.le,
        row.zd,
      ])),
    ],
  };
}

function buildSchulgruppenAssignmentCsv(report) {
  return {
    rows: [
      ["Rolle", "Schulgruppe", "Beschreibung", "Aktiv", "SNR", "Schule"],
      ...report.rows.map((row) => ([
        row.rolle,
        row.schulgruppe,
        row.beschreibung,
        row.aktiv,
        row.snr,
        row.schule,
      ])),
    ],
  };
}

module.exports = {
  buildSchulgruppenReport,
  buildSchulgruppenCsv,
  buildSchulgruppenAssignmentReport,
  buildSchulgruppenAssignmentCsv,
  mapSchoolGroupRow,
  mapSchoolGroupAssignmentRow,
  sanitizeFileName,
};
