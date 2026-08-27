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

function buildRoundValues(status, registeredSchoolName, registeredSchoolSnr, coordinatedSchoolName, coordinatedSchoolSnr) {
  const statusText = normalizeText(status) || "-";
  const isAssigned = ["zuordnung", "zugeordnet"].includes(statusText.toLowerCase());
  const schoolText = isAssigned
    ? (normalizeText(coordinatedSchoolName) || normalizeText(coordinatedSchoolSnr) || "-")
    : (normalizeText(registeredSchoolName) || normalizeText(registeredSchoolSnr) || "-");
  return {
    status: statusText,
    schule: schoolText,
  };
}

async function loadTableColumns(pool, tableName) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${tableName}`);
  return new Set((rows || []).map((row) => String(row?.Field || "").trim()).filter(Boolean));
}

async function buildSchuelerRundenuebersichtReport(pool, verfahrenId) {
  const procedure = await anmeldeverfahrenModel.findById(pool, verfahrenId);
  if (!procedure) {
    const error = new Error("Anmeldeverfahren nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

  const rounds = await anmelderundenModel.listByVerfahrenId(pool, verfahrenId);
  const studentColumns = await loadTableColumns(pool, "anm_schueler");
  if (!studentColumns.size) {
    return {
      procedure,
      rounds,
      rows: [],
      generated_at: formatTimestampDate(new Date()),
    };
  }

  if (!studentColumns.has("verfahren_id")) {
    const error = new Error("Die Tabelle anm_schueler enthaelt keine verfahren_id-Spalte.");
    error.statusCode = 500;
    throw error;
  }
  const filters = ["sr.verfahren_id = ?"];
  const params = [verfahrenId];

  const [studentRows] = await pool.query(
    `
    SELECT
      COALESCE(s.id, 0) AS interne_schueler_id,
      (
        SELECT CASE
          WHEN COUNT(DISTINCT NULLIF(TRIM(x.externe_id), '')) = 1
          THEN MIN(NULLIF(TRIM(x.externe_id), ''))
          ELSE NULL
        END
        FROM anm_schueler_externe_id x
        WHERE x.schueler_id = s.id
      ) AS externe_schueler_id,
      COALESCE(NULLIF(TRIM(s.vorname), ''), '') AS vorname,
      COALESCE(NULLIF(TRIM(s.nachname), ''), '') AS nachname,
      DATE_FORMAT(s.geburtsdatum, '%Y-%m-%d') AS geburtsdatum,
      COALESCE(NULLIF(TRIM(s.herkunftsschule_snr), ''), '') AS herkunftsschule_snr,
      COALESCE(NULLIF(TRIM(src.name), ''), '') AS quell_schule_name,
      COALESCE(NULLIF(TRIM(sr.schul_nr), ''), '') AS anmeldeschule_snr,
      COALESCE(NULLIF(TRIM(reg.name), ''), '') AS anmeldeschule_name,
      COALESCE(NULLIF(TRIM(sr.koordinierte_snr), ''), '') AS zugewiesene_schule_snr,
      COALESCE(NULLIF(TRIM(coord.name), ''), '') AS zugewiesene_schule_name,
      COALESCE(NULLIF(TRIM(sr.anmeldestatus), ''), '') AS anmeldestatus,
      COALESCE(sr.runde_id, 0) AS runde_id,
      COALESCE(r.runden_nummer, 0) AS runden_nummer
    FROM anm_schueler s
    JOIN anm_schueler_runde sr
      ON sr.schueler_id = s.id
     AND sr.verfahren_id = s.verfahren_id
    LEFT JOIN anm_runde r
      ON r.id = sr.runde_id
    LEFT JOIN anm_schulen src
      ON src.snr = NULLIF(TRIM(s.herkunftsschule_snr), '')
    LEFT JOIN anm_schulen reg
      ON reg.snr = NULLIF(TRIM(sr.schul_nr), '')
    LEFT JOIN anm_schulen coord
      ON coord.snr = NULLIF(TRIM(sr.koordinierte_snr), '')
    WHERE ${filters.join(" AND ")}
    ORDER BY COALESCE(s.nachname, '') ASC, COALESCE(s.vorname, '') ASC, COALESCE(s.id, 0) ASC, COALESCE(r.runden_nummer, 0) ASC
    `,
    params,
  );

  const grouped = new Map();
  for (const row of studentRows || []) {
    const studentKey = String(Number(row?.interne_schueler_id || 0));
    if (!studentKey) continue;

    const currentRoundNumber = Number(row?.runden_nummer || 0);
    const entry = grouped.get(studentKey) || {
      interne_schueler_id: Number(row?.interne_schueler_id || 0),
      externe_schueler_id: normalizeText(row?.externe_schueler_id),
      nachname: normalizeText(row?.nachname),
      vorname: normalizeText(row?.vorname),
      geburtsdatum: row?.geburtsdatum || "",
      abgebende_schule_nr: normalizeText(row?.herkunftsschule_snr),
      abgebende_schule_name: normalizeText(row?.quell_schule_name),
      round_values: {
        1: { status: "-", schule: "-" },
        2: { status: "-", schule: "-" },
        3: { status: "-", schule: "-" },
      },
      first_interne_schueler_id: Number(row?.interne_schueler_id || 0),
    };

    if (!entry.nachname) entry.nachname = normalizeText(row?.nachname);
    if (!entry.vorname) entry.vorname = normalizeText(row?.vorname);
    if (!entry.geburtsdatum) entry.geburtsdatum = row?.geburtsdatum || "";
    if (!entry.abgebende_schule_nr) entry.abgebende_schule_nr = normalizeText(row?.herkunftsschule_snr);
    if (!entry.abgebende_schule_name) entry.abgebende_schule_name = normalizeText(row?.quell_schule_name);
    if (!entry.first_interne_schueler_id) entry.first_interne_schueler_id = Number(row?.interne_schueler_id || 0);

    if (currentRoundNumber >= 1 && currentRoundNumber <= 3) {
      entry.round_values[currentRoundNumber] = buildRoundValues(
        row?.anmeldestatus,
        row?.anmeldeschule_name,
        row?.anmeldeschule_snr,
        row?.zugewiesene_schule_name,
        row?.zugewiesene_schule_snr,
      );
    }

    grouped.set(studentKey, entry);
  }

  const rows = Array.from(grouped.values())
    .sort((left, right) => {
      const surnameCompare = String(left.nachname || "").localeCompare(String(right.nachname || ""), "de", { numeric: true });
      if (surnameCompare !== 0) return surnameCompare;
      const firstnameCompare = String(left.vorname || "").localeCompare(String(right.vorname || ""), "de", { numeric: true });
      if (firstnameCompare !== 0) return firstnameCompare;
      return left.interne_schueler_id - right.interne_schueler_id;
    })
    .map((entry, index) => ({
      lfd_nr: index + 1,
      interne_schueler_id: entry.interne_schueler_id,
      externe_schueler_id: entry.externe_schueler_id,
      name_vorname: [entry.nachname, entry.vorname].filter(Boolean).join(", ") || "-",
      geburtsdatum: formatDisplayDate(entry.geburtsdatum),
      abgebende_schule_nr: entry.abgebende_schule_nr || "-",
      abgebende_schule_name: entry.abgebende_schule_name || "-",
      r1_status: entry.round_values[1]?.status || "-",
      r1_schule: entry.round_values[1]?.schule || "-",
      r2_status: entry.round_values[2]?.status || "-",
      r2_schule: entry.round_values[2]?.schule || "-",
      r3_status: entry.round_values[3]?.status || "-",
      r3_schule: entry.round_values[3]?.schule || "-",
    }));

  return {
    procedure,
    rounds,
    rows,
    generated_at: formatTimestampDate(new Date()),
  };
}

function buildSchuelerRundenuebersichtCsv(report) {
  const header = [
    "Lfd. Nr.",
    "Schueler-ID",
    "Name, Vorname",
    "Geb.-Dat.",
    "Nr. abg. Schule",
    "Name abgebende Schule",
    "R1-Status",
    "R1-Schule",
    "R2-Status",
    "R2-Schule",
    "R3-Status",
    "R3-Schule",
  ];

  const rows = [
    header,
    ...report.rows.map((row) => ([
      row.lfd_nr,
      row.externe_schueler_id || row.interne_schueler_id,
      row.name_vorname,
      row.geburtsdatum,
      row.abgebende_schule_nr,
      row.abgebende_schule_name,
      row.r1_status,
      row.r1_schule,
      row.r2_status,
      row.r2_schule,
      row.r3_status,
      row.r3_schule,
    ])),
  ];

  return {
    rows,
    fileName: `schueleruebersicht_runden_${report.procedure.id}`,
  };
}

function buildSchuelerRundenuebersichtPdfLines(report) {
  const lines = [
    "Schueleruebersicht ueber alle Runden",
    `Verfahren: ${report.procedure.bezeichnung || "-"}`,
    `Schuljahr: ${report.procedure.schuljahr || "-"}`,
    `Erstellt am: ${report.generated_at}`,
    `Datensaetze: ${report.rows.length}`,
    "",
    "Lfd | Schueler-ID | Name | Geb.-Dat. | Abg. Schule | R1-Status | R1-Schule | R2-Status | R2-Schule | R3-Status | R3-Schule",
  ];

  report.rows.forEach((row) => {
    lines.push(
      [
        row.lfd_nr,
        row.externe_schueler_id || row.interne_schueler_id,
        row.name_vorname,
        row.geburtsdatum,
        `${row.abgebende_schule_nr} ${row.abgebende_schule_name}`.trim(),
        row.r1_status,
        row.r1_schule,
        row.r2_status,
        row.r2_schule,
        row.r3_status,
        row.r3_schule,
      ].join(" | "),
    );
  });

  return {
    lines,
    fileName: `schueleruebersicht_runden_${report.procedure.id}`,
  };
}

module.exports = {
  buildSchuelerRundenuebersichtReport,
  buildSchuelerRundenuebersichtCsv,
  buildSchuelerRundenuebersichtPdfLines,
  sanitizeFileName,
};

