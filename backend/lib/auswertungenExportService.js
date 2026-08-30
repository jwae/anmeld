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
  buildSchuelerlisteReport,
  buildSchuelerlisteCsv,
  sanitizeFileName: sanitizeStudentListFileName,
} = require("./schuelerlistenReportService");
const {
  buildSchulenReport,
  buildSchulenCsv,
  buildSchulenPdfLines,
  sanitizeFileName: sanitizeSchoolsFileName,
} = require("./schulenReportService");
const {
  buildOffeneFaelleReport,
  buildOffeneFaelleCsv,
  sanitizeFileName: sanitizeOpenCasesFileName,
} = require("./offeneFaelleReportService");
const {
  buildSchulgruppenReport,
  buildSchulgruppenCsv,
  buildSchulgruppenAssignmentReport,
  buildSchulgruppenAssignmentCsv,
  sanitizeFileName: sanitizeSchoolGroupsFileName,
} = require("./schulgruppenReportService");
const {
  buildKapazitaetenPreviewReport,
  buildZusammenfassungPreviewReport,
} = require("./verfahrensuebersichtReportService");

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
    const report = await buildSchulgruppenAssignmentReport(pool, verfahrenId, rundeId);
    const csvExport = buildSchulgruppenAssignmentCsv(report);
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

  if (bereich === "verfahrensuebersicht" && auswertung === "kapazitaeten") {
    const report = await buildKapazitaetenPreviewReport(pool, verfahrenId, rundeId);
    const baseName = sanitizeSchoolGroupsFileName(
      `kapazitaeten-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`,
    );
    const header = [
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
    ];
    const dataRows = report.rows.map((row) => ([
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
    ]));

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv([header, ...dataRows]), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }

    if (format === "pdf") {
      return {
        buffer: createSimplePdf([
          `Kapazitaeten - ${report.procedure.bezeichnung || "-"}`,
          `Runde ${report.round.runden_nummer}: ${report.round.bezeichnung || "-"}`,
          "",
          header.join(" | "),
          ...dataRows.map((row) => row.join(" | ")),
        ], {
          landscape: true,
          fontSize: 7,
          lineHeight: 10,
          marginLeft: 20,
          marginTop: 24,
          marginBottom: 18,
        }),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }
  }

  if (bereich === "verfahrensuebersicht" && auswertung === "zusammenfassung") {
    const report = await buildZusammenfassungPreviewReport(pool, verfahrenId, rundeId);
    const baseName = sanitizeSchoolGroupsFileName(
      `zusammenfassung-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`,
    );
    const dataRows = report.rows.map((row) => ([row.kennzahl, row.wert]));

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv([["Kennzahl", "Wert"], ...dataRows]), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }

    if (format === "pdf") {
      return {
        buffer: createSimplePdf([
          `Zusammenfassung - ${report.procedure.bezeichnung || "-"}`,
          `Runde ${report.round.runden_nummer}: ${report.round.bezeichnung || "-"}`,
          "",
          ...dataRows.map(([label, value]) => `${label}: ${value}`),
        ]),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
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

  if (
    bereich === "schuelerlisten"
    && ["alle-schueler", "neuaufnahme", "zugeordnete-schueler", "ohne-anmeldung", "nach-zielschule", "foerderbedarf"].includes(auswertung)
  ) {
    const report = await buildSchuelerlisteReport(pool, verfahrenId, rundeId, auswertung);
    const csvExport = buildSchuelerlisteCsv(report);
    const baseName = sanitizeStudentListFileName(
      `${report.definition.fileName}-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`,
    );

    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(csvExport.rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
  }

  if (
    bereich === "schulen"
    && ["anmeldungen-je-schule", "zugeordnete-schueler", "freie-plaetze", "kapazitaetsuebersicht"].includes(auswertung)
  ) {
    const report = await buildSchulenReport(pool, verfahrenId, rundeId, auswertung);
    const baseName = sanitizeSchoolsFileName(
      `${report.definition.fileName}-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`,
    );
    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(buildSchulenCsv(report).rows), "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${baseName}.csv`,
      };
    }
    if (format === "pdf") {
      return {
        buffer: createSimplePdf(buildSchulenPdfLines(report), {
          landscape: true,
          fontSize: 7,
          lineHeight: 10,
          marginLeft: 20,
          marginTop: 24,
          marginBottom: 18,
        }),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      };
    }
  }

  if (bereich === "offene-faelle" && auswertung === "alle-offenen-faelle") {
    const report = await buildOffeneFaelleReport(pool, verfahrenId, rundeId);
    const baseName = sanitizeOpenCasesFileName(
      `offene-faelle-runde-${report.round.runden_nummer}-${report.procedure.bezeichnung}`,
    );
    if (format === "excel") {
      return {
        buffer: Buffer.from(buildCsv(buildOffeneFaelleCsv(report).rows), "utf8"),
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
