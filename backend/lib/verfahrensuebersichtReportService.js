const anmeldeverfahrenModel = require("../models/anmeldeverfahrenModel");
const anmelderundenModel = require("../models/anmelderundenModel");
const { buildSchulgruppenReport } = require("./schulgruppenReportService");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function formatDate(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeText(value) || "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function formatBoolean(value) {
  return Number(value || 0) === 1 || value === true ? "Ja" : "Nein";
}

async function loadProcedureAndRound(pool, verfahrenId, rundeId) {
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

async function buildVerfahrensdatenPreviewReport(pool, verfahrenId, rundeId) {
  const { procedure, round } = await loadProcedureAndRound(pool, verfahrenId, rundeId);
  const rounds = await anmelderundenModel.listByVerfahrenId(pool, verfahrenId);
  const schoolGroups = await anmeldeverfahrenModel.listProcedureSchoolGroups(pool, verfahrenId);
  const workingRound = rounds.find((item) => item.ist_arbeitsrunde) || null;
  const rows = [
    { bereich: "Verfahren", feld: "Bezeichnung", wert: procedure.bezeichnung || "-" },
    { bereich: "Verfahren", feld: "Schuljahr", wert: procedure.schuljahr || "-" },
    { bereich: "Verfahren", feld: "Verfahrenstyp", wert: procedure.verfahrenstyp || "-" },
    { bereich: "Verfahren", feld: "Status", wert: procedure.status || "-" },
    { bereich: "Verfahren", feld: "Sichtbar", wert: formatBoolean(procedure.sichtbar) },
    { bereich: "Verfahren", feld: "Arbeitsrunde", wert: workingRound ? `Runde ${workingRound.runden_nummer} - ${workingRound.bezeichnung || "-"}` : "-" },
    { bereich: "Verfahren", feld: "Ausgewaehlte Runde", wert: `Runde ${round.runden_nummer} - ${round.bezeichnung || "-"}` },
    { bereich: "Schulgruppen", feld: "Zielschulgruppen", wert: schoolGroups.zielschulen.length },
    { bereich: "Schulgruppen", feld: "Quellschulgruppen", wert: schoolGroups.quellschulen.length },
    ...rounds.flatMap((item) => ([
      { bereich: `Runde ${item.runden_nummer}`, feld: "Bezeichnung", wert: item.bezeichnung || "-" },
      { bereich: `Runde ${item.runden_nummer}`, feld: "Status", wert: item.status || "-" },
      { bereich: `Runde ${item.runden_nummer}`, feld: "Zeitraum", wert: `${formatDate(item.startdatum)} - ${formatDate(item.enddatum)}` },
    ])),
  ];

  return { procedure, round, generated_at: formatDate(new Date()), rows };
}

async function buildKapazitaetenPreviewReport(pool, verfahrenId, rundeId) {
  return buildSchulgruppenReport(pool, verfahrenId, rundeId);
}

async function buildZusammenfassungPreviewReport(pool, verfahrenId, rundeId) {
  const schoolGroupsReport = await buildSchulgruppenReport(pool, verfahrenId, rundeId);
  const totals = schoolGroupsReport.rows.reduce((result, row) => ({
    gesamtkapazitaet: result.gesamtkapazitaet + Number(row.gesamtkapazitaet || 0),
    maximale_klassen: result.maximale_klassen + Number(row.maximale_klassen || 0),
    anmeldungen_gesamt: result.anmeldungen_gesamt + Number(row.anmeldungen_gesamt || 0),
    freie_plaetze: result.freie_plaetze + Number(row.freie_plaetze || 0),
    warteliste: result.warteliste + Number(row.warteliste || 0),
    le: result.le + Number(row.le || 0),
    zd: result.zd + Number(row.zd || 0),
  }), {
    gesamtkapazitaet: 0,
    maximale_klassen: 0,
    anmeldungen_gesamt: 0,
    freie_plaetze: 0,
    warteliste: 0,
    le: 0,
    zd: 0,
  });

  const rows = [
    { kennzahl: "Beteiligte Zielschulen", wert: schoolGroupsReport.rows.length },
    { kennzahl: "Gesamtkapazitaet", wert: totals.gesamtkapazitaet },
    { kennzahl: "Maximale Klassen", wert: totals.maximale_klassen },
    { kennzahl: "Anmeldungen gesamt", wert: totals.anmeldungen_gesamt },
    { kennzahl: "Freie Plaetze", wert: totals.freie_plaetze },
    { kennzahl: "Warteliste", wert: totals.warteliste },
    { kennzahl: "Foerderbedarf (LE)", wert: totals.le },
    { kennzahl: "Zieldifferent (ZD)", wert: totals.zd },
  ];

  return {
    procedure: schoolGroupsReport.procedure,
    round: schoolGroupsReport.round,
    generated_at: schoolGroupsReport.generated_at,
    rows,
  };
}

module.exports = {
  buildVerfahrensdatenPreviewReport,
  buildKapazitaetenPreviewReport,
  buildZusammenfassungPreviewReport,
};
