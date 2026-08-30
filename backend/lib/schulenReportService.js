const anmeldeverfahrenModel = require("../models/anmeldeverfahrenModel");
const anmelderundenModel = require("../models/anmelderundenModel");
const { buildSchuelerlisteReport } = require("./schuelerlistenReportService");

const REPORT_DEFINITIONS = {
  "anmeldungen-je-schule": { title: "Anmeldungen je Schule", fileName: "anmeldungen-je-schule", kind: "metrics" },
  "zugeordnete-schueler": { title: "Zugeordnete Schueler je Schule", fileName: "zugeordnete-schueler-je-schule", kind: "students" },
  "freie-plaetze": { title: "Freie Plaetze je Schule", fileName: "freie-plaetze-je-schule", kind: "metrics" },
  kapazitaetsuebersicht: { title: "Kapazitaetsuebersicht je Schule", fileName: "kapazitaetsuebersicht-je-schule", kind: "capacities" },
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

function formatTimestampDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

async function loadContext(pool, verfahrenId, rundeId) {
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
  return { procedure, round };
}

async function buildSchoolMetrics(pool, verfahrenId, rundeId) {
  const [rows] = await pool.query(
    `
    SELECT
      s.snr,
      COALESCE(NULLIF(TRIM(s.name), ''), '-') AS schule,
      COALESCE(NULLIF(TRIM(sf.sf_kurz), ''), NULLIF(TRIM(s.sf_id), ''), '-') AS schulform,
      COALESCE(cap.kapazitaet, 0) AS kapazitaet,
      COALESCE(cap.reservierte_plaetze, 0) AS reservierte_plaetze,
      COALESCE(stat.anmeldungen, 0) AS anmeldungen,
      COALESCE(stat.neuaufnahmen, 0) AS neuaufnahmen,
      COALESCE(stat.warteliste, 0) AS warteliste,
      COALESCE(zuo.zugeordnet, 0) AS zugeordnet
    FROM (
      SELECT DISTINCT sgs.snr
      FROM anm_verfahren_schulgruppe vsg
      JOIN anm_schulgruppe_schule sgs ON sgs.schulgruppe_id = vsg.schulgruppe_id
      WHERE vsg.verfahren_id = ?
        AND vsg.rolle = 'Zielschulen'
    ) beteiligt
    JOIN anm_schulen s ON s.snr = beteiligt.snr
    LEFT JOIN anm_kat_sf sf ON sf.code = s.sf_id
    LEFT JOIN (
      SELECT
        k.snr,
        SUM(COALESCE(k.gesamtkapazitaet, 0)) AS kapazitaet,
        SUM(COALESCE(k.reservierte_plaetze, 0)) AS reservierte_plaetze
      FROM anm_kapazitaet k
      WHERE k.verfahren_id = ?
      GROUP BY k.snr
    ) cap ON cap.snr = s.snr
    LEFT JOIN (
      SELECT
        NULLIF(TRIM(sr.schul_nr), '') AS snr,
        COUNT(*) AS anmeldungen,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) = 'neuaufnahme' THEN 1 ELSE 0 END) AS neuaufnahmen,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) = 'warteliste' THEN 1 ELSE 0 END) AS warteliste
      FROM anm_schueler_runde sr
      WHERE sr.verfahren_id = ?
        AND sr.runde_id = ?
        AND NULLIF(TRIM(sr.schul_nr), '') IS NOT NULL
      GROUP BY NULLIF(TRIM(sr.schul_nr), '')
    ) stat ON stat.snr = s.snr
    LEFT JOIN (
      SELECT
        COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), NULLIF(TRIM(sr.schul_nr), '')) AS snr,
        COUNT(*) AS zugeordnet
      FROM anm_schueler_runde sr
      WHERE sr.verfahren_id = ?
        AND sr.runde_id = ?
        AND LOWER(TRIM(COALESCE(sr.anmeldestatus, ''))) IN ('zuordnung', 'zugeordnet')
      GROUP BY COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), NULLIF(TRIM(sr.schul_nr), ''))
    ) zuo ON zuo.snr = s.snr
    ORDER BY schule ASC, s.snr ASC
    `,
    [verfahrenId, verfahrenId, verfahrenId, rundeId, verfahrenId, rundeId],
  );

  return (rows || []).map((row) => {
    const kapazitaet = Number(row?.kapazitaet || 0);
    const reserviertePlaetze = Number(row?.reservierte_plaetze || 0);
    const neuaufnahmen = Number(row?.neuaufnahmen || 0);
    return {
      snr: normalizeText(row?.snr),
      schule: normalizeText(row?.schule) || "-",
      schulform: normalizeText(row?.schulform) || "-",
      anmeldungen: Number(row?.anmeldungen || 0),
      neuaufnahmen,
      warteliste: Number(row?.warteliste || 0),
      zugeordnet: Number(row?.zugeordnet || 0),
      kapazitaet,
      reservierte_plaetze: reserviertePlaetze,
      freie_plaetze: kapazitaet - reserviertePlaetze - neuaufnahmen,
    };
  });
}

async function buildCapacityOverview(pool, verfahrenId) {
  const [rows] = await pool.query(
    `
    SELECT
      s.snr,
      COALESCE(NULLIF(TRIM(s.name), ''), '-') AS schule,
      COALESCE(NULLIF(TRIM(sf.sf_kurz), ''), NULLIF(TRIM(s.sf_id), ''), '-') AS schulform,
      COALESCE(NULLIF(TRIM(k.jahrgang), ''), '-') AS jahrgang,
      COALESCE(k.maximale_klassen, 0) AS maximale_klassen,
      COALESCE(k.maximale_schueler_pro_klasse, 0) AS schueler_pro_klasse,
      COALESCE(k.gesamtkapazitaet, 0) AS gesamtkapazitaet,
      COALESCE(k.reservierte_plaetze, 0) AS reservierte_plaetze,
      COALESCE(NULLIF(TRIM(k.bemerkung), ''), '-') AS bemerkung
    FROM (
      SELECT DISTINCT sgs.snr
      FROM anm_verfahren_schulgruppe vsg
      JOIN anm_schulgruppe_schule sgs ON sgs.schulgruppe_id = vsg.schulgruppe_id
      WHERE vsg.verfahren_id = ?
        AND vsg.rolle = 'Zielschulen'
    ) beteiligt
    JOIN anm_schulen s ON s.snr = beteiligt.snr
    LEFT JOIN anm_kat_sf sf ON sf.code = s.sf_id
    LEFT JOIN anm_kapazitaet k ON k.snr = s.snr AND k.verfahren_id = ?
    ORDER BY schule ASC, s.snr ASC, k.jahrgang ASC
    `,
    [verfahrenId, verfahrenId],
  );

  return (rows || []).map((row) => {
    const gesamtkapazitaet = Number(row?.gesamtkapazitaet || 0);
    const reserviertePlaetze = Number(row?.reservierte_plaetze || 0);
    return {
      snr: normalizeText(row?.snr),
      schule: normalizeText(row?.schule) || "-",
      schulform: normalizeText(row?.schulform) || "-",
      jahrgang: normalizeText(row?.jahrgang) || "-",
      maximale_klassen: Number(row?.maximale_klassen || 0),
      schueler_pro_klasse: Number(row?.schueler_pro_klasse || 0),
      gesamtkapazitaet,
      reservierte_plaetze: reserviertePlaetze,
      verfuegbare_plaetze: gesamtkapazitaet - reserviertePlaetze,
      bemerkung: normalizeText(row?.bemerkung) || "-",
    };
  });
}

async function buildSchulenReport(pool, verfahrenId, rundeId, auswertung) {
  const definition = REPORT_DEFINITIONS[normalizeText(auswertung)];
  if (!definition) {
    const error = new Error("Schulauswertung nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }
  const { procedure, round } = await loadContext(pool, verfahrenId, rundeId);
  let rows;
  if (definition.kind === "students") {
    const report = await buildSchuelerlisteReport(pool, verfahrenId, rundeId, "zugeordnete-schueler");
    rows = report.rows
      .sort((left, right) => (
        String(left.schule || "").localeCompare(String(right.schule || ""), "de", { numeric: true })
        || String(left.name_vorname || "").localeCompare(String(right.name_vorname || ""), "de", { numeric: true })
      ))
      .map((row, index) => ({
        ...row,
        lfd_nr: index + 1,
        externe_schueler_id: row.externe_schueler_id || row.interne_schueler_id,
      }));
  } else if (definition.kind === "capacities") {
    rows = await buildCapacityOverview(pool, verfahrenId);
  } else {
    rows = await buildSchoolMetrics(pool, verfahrenId, rundeId);
  }
  return { definition, procedure, round, generated_at: formatTimestampDate(new Date()), rows };
}

function columnsForReport(report) {
  if (report.definition.kind === "students") {
    return [
      ["lfd_nr", "Lfd. Nr."], ["externe_schueler_id", "Schueler-ID"], ["name_vorname", "Name, Vorname"],
      ["geburtsdatum", "Geb.-Dat."], ["abgebende_schule_nr", "Nr. abg. Schule"],
      ["abgebende_schule_name", "Name abgebende Schule"], ["schule", "Zielschule"],
      ["foerderbedarf", "Foerderbedarf"], ["zieldifferent", "ZD"], ["bemerkung", "Bemerkung"],
    ];
  }
  if (report.definition.kind === "capacities") {
    return [
      ["snr", "SNR"], ["schule", "Schule"], ["schulform", "Schulform"], ["jahrgang", "Jahrgang"],
      ["maximale_klassen", "Max. Klassen"], ["schueler_pro_klasse", "Schueler je Klasse"],
      ["gesamtkapazitaet", "Gesamtkapazitaet"], ["reservierte_plaetze", "Reserviert"],
      ["verfuegbare_plaetze", "Verfuegbar"], ["bemerkung", "Bemerkung"],
    ];
  }
  return [
    ["snr", "SNR"], ["schule", "Schule"], ["schulform", "Schulform"], ["anmeldungen", "Anmeldungen"],
    ["neuaufnahmen", "Neuaufnahmen"], ["warteliste", "Warteliste"], ["zugeordnet", "Zugeordnet"],
    ["kapazitaet", "Kapazitaet"], ["reservierte_plaetze", "Reserviert"], ["freie_plaetze", "Freie Plaetze"],
  ];
}

function buildSchulenCsv(report) {
  const columns = columnsForReport(report);
  return { rows: [columns.map((column) => column[1]), ...report.rows.map((row) => columns.map((column) => row[column[0]] ?? ""))] };
}

function buildSchulenPdfLines(report) {
  const columns = columnsForReport(report);
  return [
    report.definition.title,
    `Verfahren: ${report.procedure.bezeichnung || "-"}`,
    `Runde: ${report.round.bezeichnung || `Runde ${report.round.runden_nummer}`}`,
    `Erstellt am: ${report.generated_at}`,
    "",
    columns.map((column) => column[1]).join(" | "),
    ...report.rows.map((row) => columns.map((column) => row[column[0]] ?? "").join(" | ")),
  ];
}

module.exports = {
  REPORT_DEFINITIONS,
  buildSchulenReport,
  buildSchulenCsv,
  buildSchulenPdfLines,
  columnsForReport,
  sanitizeFileName,
};
