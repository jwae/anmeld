const anmeldeverfahrenModel = require("../models/anmeldeverfahrenModel");
const anmelderundenModel = require("../models/anmelderundenModel");
const { createSimplePdf } = require("./simplePdf");
const {
  buildSchuelerRundenuebersichtReport,
  buildSchuelerRundenuebersichtCsv,
  buildSchuelerRundenuebersichtPdfLines,
  sanitizeFileName: sanitizeRoundOverviewFileName,
} = require("./schuelerRundenuebersichtService");
const {
  buildOffeneAnmeldungenReport,
  buildOffeneAnmeldungenCsv,
  buildOffeneAnmeldungenPdfLines,
  sanitizeFileName: sanitizeOpenStatusesFileName,
} = require("./offeneAnmeldungenReportService");
const {
  buildPoolSchuelerAktuelleRundeReport,
  buildPoolSchuelerAktuelleRundeCsv,
  buildPoolSchuelerAktuelleRundePdfLines,
  sanitizeFileName: sanitizePoolStudentsFileName,
} = require("./poolSchuelerAktuelleRundeReportService");
const {
  buildSchuelerNachHerkunftsschuleReport,
  buildSchuelerNachHerkunftsschuleCsv,
  buildSchuelerNachHerkunftsschulePdfLines,
  sanitizeFileName: sanitizeSourceSchoolFileName,
} = require("./schuelerNachHerkunftsschuleReportService");
const {
  buildSchulgruppenReport,
  buildSchulgruppenCsv,
  sanitizeFileName: sanitizeSchoolGroupsFileName,
} = require("./schulgruppenReportService");

function normalizeText(value) {
  return String(value || "").trim();
}

function csvValue(value) {
  const normalized = String(value ?? "");
  if (!/[;"\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function buildCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvValue).join(";")).join("\r\n")}`;
}

function formatDate(value) {
  const text = normalizeText(value);
  return text || "-";
}

function formatBoolean(value) {
  return value ? "Ja" : "Nein";
}

async function buildProcedureDataReport(pool, verfahrenId) {
  const procedure = await anmeldeverfahrenModel.findById(pool, verfahrenId);
  if (!procedure) {
    const error = new Error("Anmeldeverfahren nicht gefunden.");
    error.statusCode = 404;
    throw error;
  }

  const rounds = await anmelderundenModel.listByVerfahrenId(pool, verfahrenId);
  const schoolGroups = await anmeldeverfahrenModel.listProcedureSchoolGroups(pool, verfahrenId);
  const workingRound = rounds.find((round) => round.ist_arbeitsrunde) || null;

  return {
    procedure,
    rounds,
    schoolGroups,
    workingRound,
  };
}

function buildProcedureDataPdf(report, rundeId) {
  const { procedure, rounds, schoolGroups, workingRound } = report;
  const selectedRound = rounds.find((round) => Number(round.id) === Number(rundeId)) || workingRound;
  const lines = [
    "Auswertung: Verfahrensuebersicht - Verfahrensdaten",
    "",
    `Verfahren: ${procedure.bezeichnung || "-"}`,
    `Schuljahr: ${procedure.schuljahr || "-"}`,
    `Verfahrenstyp: ${procedure.verfahrenstyp || "-"}`,
    `Status Verfahren: ${procedure.status || "-"}`,
    `Sichtbar: ${formatBoolean(procedure.sichtbar)}`,
    `Arbeitsrunde: ${workingRound ? `Runde ${workingRound.runden_nummer} - ${workingRound.bezeichnung}` : "-"}`,
    `Aktuelle Runde: ${selectedRound ? `Runde ${selectedRound.runden_nummer} - ${selectedRound.bezeichnung}` : "-"}`,
    "",
    "Rundendaten",
    ...rounds.flatMap((round) => ([
      `Runde ${round.runden_nummer}: ${round.bezeichnung || "-"}`,
      `  Status: ${round.status || "-"}`,
      `  Startdatum: ${formatDate(round.startdatum)}`,
      `  Enddatum: ${formatDate(round.enddatum)}`,
      `  Arbeitsrunde: ${formatBoolean(round.ist_arbeitsrunde)}`,
    ])),
    "",
    `Zielschulgruppen: ${schoolGroups.zielschulen.length}`,
    `Quellschulgruppen: ${schoolGroups.quellschulen.length}`,
  ];

  return createSimplePdf(lines);
}

function buildProcedureDataCsv(report, rundeId) {
  const { procedure, rounds, schoolGroups, workingRound } = report;
  const selectedRound = rounds.find((round) => Number(round.id) === Number(rundeId)) || workingRound;

  const rows = [
    ["Bereich", "Feld", "Wert"],
    ["Verfahren", "Bezeichnung", procedure.bezeichnung || ""],
    ["Verfahren", "Schuljahr", procedure.schuljahr || ""],
    ["Verfahren", "Verfahrenstyp", procedure.verfahrenstyp || ""],
    ["Verfahren", "Status", procedure.status || ""],
    ["Verfahren", "Sichtbar", formatBoolean(procedure.sichtbar)],
    ["Verfahren", "Arbeitsrunde", workingRound ? `Runde ${workingRound.runden_nummer} - ${workingRound.bezeichnung}` : ""],
    ["Verfahren", "Aktuelle Runde", selectedRound ? `Runde ${selectedRound.runden_nummer} - ${selectedRound.bezeichnung}` : ""],
    ["Verfahren", "Zielschulgruppen", schoolGroups.zielschulen.length],
    ["Verfahren", "Quellschulgruppen", schoolGroups.quellschulen.length],
    [],
    ["Runden", "Rundennummer", "Bezeichnung", "Status", "Startdatum", "Enddatum", "Arbeitsrunde"],
    ...rounds.map((round) => ([
      "Runde",
      round.runden_nummer,
      round.bezeichnung || "",
      round.status || "",
      formatDate(round.startdatum),
      formatDate(round.enddatum),
      formatBoolean(round.ist_arbeitsrunde),
    ])),
  ];

  return Buffer.from(buildCsv(rows), "utf8");
}

async function createAuswertungDownload({ pool, verfahrenId, rundeId, bereich, auswertung, format }) {
  if (bereich === "verfahrensuebersicht" && auswertung === "verfahrensdaten") {
    const report = await buildProcedureDataReport(pool, verfahrenId);
    const baseName = sanitizeRoundOverviewFileName(`verfahrensdaten-${report.procedure.schuljahr}-${report.procedure.bezeichnung}`);

    if (format === "pdf") {
      return {
        buffer: buildProcedureDataPdf(report, rundeId),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }

    if (format === "excel") {
      return {
        buffer: buildProcedureDataCsv(report, rundeId),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  if (bereich === "verfahrensuebersicht" && auswertung === "schulgruppen") {
    const report = await buildSchulgruppenReport(pool, verfahrenId, rundeId);
    const csvExport = buildSchulgruppenCsv(report);
    const baseName = sanitizeSchoolGroupsFileName(
      `schulgruppen-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`,
    );

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(csvExport.rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  if (bereich === "statistiken" && auswertung === "entwicklung-ueber-die-runden") {
    const report = await buildSchuelerRundenuebersichtReport(pool, verfahrenId);
    const csvExport = buildSchuelerRundenuebersichtCsv(report);
    const pdfExport = buildSchuelerRundenuebersichtPdfLines(report);
    const baseName = sanitizeRoundOverviewFileName(`schueleruebersicht-runden-${report.procedure.id}-${report.procedure.bezeichnung}`);

    if (format === "pdf") {
      return {
        buffer: createSimplePdf(pdfExport.lines, {
          landscape: true,
          fontSize: 8,
          lineHeight: 11,
          marginLeft: 24,
          marginTop: 28,
          marginBottom: 18,
        }),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(csvExport.rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  if (bereich === "schuelerlisten" && auswertung === "warteliste") {
    const report = await buildOffeneAnmeldungenReport(pool, verfahrenId, rundeId);
    const csvExport = buildOffeneAnmeldungenCsv(report);
    const pdfExport = buildOffeneAnmeldungenPdfLines(report);
    const baseName = sanitizeOpenStatusesFileName(`offene-anmeldungen-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`);

    if (format === "pdf") {
      return {
        buffer: createSimplePdf(pdfExport.lines, {
          landscape: true,
          fontSize: 8,
          lineHeight: 11,
          marginLeft: 24,
          marginTop: 28,
          marginBottom: 18,
        }),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(csvExport.rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  if (bereich === "schuelerlisten" && auswertung === "nur-pool") {
    const report = await buildPoolSchuelerAktuelleRundeReport(pool, verfahrenId, rundeId);
    const csvExport = buildPoolSchuelerAktuelleRundeCsv(report);
    const pdfExport = buildPoolSchuelerAktuelleRundePdfLines(report);
    const baseName = sanitizePoolStudentsFileName(`pool-schueler-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`);

    if (format === "pdf") {
      return {
        buffer: createSimplePdf(pdfExport.lines, {
          landscape: true,
          fontSize: 8,
          lineHeight: 11,
          marginLeft: 24,
          marginTop: 28,
          marginBottom: 18,
        }),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(csvExport.rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  if (bereich === "schuelerlisten" && auswertung === "nach-herkunftsschule") {
    const report = await buildSchuelerNachHerkunftsschuleReport(pool, verfahrenId, rundeId);
    const csvExport = buildSchuelerNachHerkunftsschuleCsv(report);
    const pdfExport = buildSchuelerNachHerkunftsschulePdfLines(report);
    const baseName = sanitizeSourceSchoolFileName(`schueler-nach-herkunftsschule-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`);

    if (format === "pdf") {
      return {
        buffer: createSimplePdf(pdfExport.lines, {
          landscape: true,
          fontSize: 8,
          lineHeight: 11,
          marginLeft: 24,
          marginTop: 28,
          marginBottom: 18,
        }),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(csvExport.rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  return null;
}

module.exports = {
  createAuswertungDownload,
};
