const { createAuswertungDownload } = require("../lib/auswertungenExportService");
const { buildSchuelerRundenuebersichtReport } = require("../lib/schuelerRundenuebersichtService");
const { buildOffeneAnmeldungenReport } = require("../lib/offeneAnmeldungenReportService");
const { buildPoolSchuelerAktuelleRundeReport } = require("../lib/poolSchuelerAktuelleRundeReportService");
const { buildSchuelerNachHerkunftsschuleReport } = require("../lib/schuelerNachHerkunftsschuleReportService");

function normalizeText(value) {
  return String(value || "").trim();
}

const CARD_DEFINITIONS = [
  {
    id: "verfahrensuebersicht",
    title: "Verfahrensuebersicht",
    description: "Uebersicht ueber das aktuelle Verfahren.",
    formats: ["pdf", "excel"],
    options: [
      { key: "verfahrensdaten", label: "Verfahrensdaten" },
      { key: "runden", label: "Runden" },
      { key: "schulgruppen", label: "Schulgruppen" },
      { key: "kapazitaeten", label: "Kapazitaeten" },
      { key: "zusammenfassung", label: "Zusammenfassung" },
    ],
  },
  {
    id: "schuelerlisten",
    title: "Schuelerlisten",
    description: "Auswertungen der Schuelerdaten.",
    formats: ["pdf", "excel"],
      options: [
        { key: "alle-schueler", label: "Alle Schueler" },
        { key: "nur-pool", label: "Pool" },
        { key: "nur-anmeldung", label: "Nur Anmeldung" },
        { key: "pool-plus-anmeldung", label: "Pool + Anmeldung" },
        { key: "neuaufnahme", label: "Neuaufnahme" },
        { key: "warteliste", label: "Warteliste / Zuordnungen" },
        { key: "zugeordnete-schueler", label: "Zugeordnete Schueler" },
        { key: "ohne-anmeldung", label: "Ohne Anmeldung" },
      { key: "nach-zielschule", label: "Nach Zielschule mit Herkunftsschule" },
      { key: "nach-herkunftsschule", label: "Nach Herkunftsschule mit Zielschule" },
      { key: "foerderbedarf", label: "Foerderbedarf" },
      { key: "zieldifferent", label: "Zieldifferent" },
    ],
  },
  {
    id: "schulen",
    title: "Schulen",
    description: "Auswertungen je Schule.",
    formats: ["pdf", "excel"],
    options: [
      { key: "anmeldungen-je-schule", label: "Anmeldungen je Schule" },
      { key: "zugeordnete-schueler", label: "Zugeordnete Schueler" },
      { key: "freie-plaetze", label: "Freie Plaetze" },
      { key: "kapazitaetsuebersicht", label: "Kapazitaetsuebersicht" },
    ],
  },
  {
    id: "offene-faelle",
    title: "Offene Faelle",
    description: "Auswertungen aller offenen Faelle.",
    formats: ["pdf", "excel"],
    options: [
      { key: "alle-offenen-faelle", label: "Alle offenen Faelle, mit Fallgrund und Status" },
    ],
  },
  {
    id: "anschreiben",
    title: "Anschreiben",
    description: "Erzeugung von Serienanschreiben.",
    formats: ["pdf", "word"],
    options: [
      { key: "schreiben-erzieher", label: "Schreiben an die Erzieher" },
      { key: "anschreiben-schulen", label: "Anschreiben an Schulen ueber die zugeordneten Schueler" },
    ],
  },
  {
    id: "statistiken",
    title: "Statistiken",
    description: "Statistische Auswertungen.",
    formats: ["pdf", "excel"],
    options: [
      { key: "anzahl-anmeldungen", label: "Anzahl Anmeldungen" },
      { key: "anmeldungen-je-schule", label: "Anmeldungen je Schule" },
      { key: "auslastung-der-schulen", label: "Auslastung der Schulen" },
      { key: "freie-plaetze", label: "Freie Plaetze" },
      { key: "herkunftsschulen", label: "Herkunftsschulen" },
      { key: "foerderbedarf", label: "Foerderbedarf" },
      { key: "koordinierungen", label: "Koordinierungen" },
      { key: "entwicklung-ueber-die-runden", label: "Entwicklung ueber die Runden" },
    ],
  },
];

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
}

function parsePositiveNumber(value) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function createAuswertungenController({ getPool }) {
  return {
    catalog: async (req, res) => {
      const verfahrenId = parsePositiveNumber(req.query?.verfahren_id);
      const rundeId = parsePositiveNumber(req.query?.runde_id);
      if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
      if (!rundeId) return sendError(res, 400, "Ungueltige Runden-ID.");

      res.json({
        cards: CARD_DEFINITIONS,
      });
    },

    schuelerRundenuebersicht: async (req, res) => {
      try {
        const verfahrenId = parsePositiveNumber(req.query?.verfahren_id);
        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const report = await buildSchuelerRundenuebersichtReport(getPool(), verfahrenId);
        return res.json({
          title: "Schueleruebersicht ueber alle Runden",
          verfahren: {
            id: report.procedure.id,
            bezeichnung: report.procedure.bezeichnung || "",
            schuljahr: report.procedure.schuljahr || "",
          },
          generated_at: report.generated_at,
          total: report.rows.length,
          rows: report.rows,
        });
      } catch (error) {
        console.error(error);
        return sendError(
          res,
          error?.statusCode || 500,
          error?.message || "Die Schueleruebersicht konnte nicht geladen werden.",
        );
      }
    },

    offeneAnmeldungen: async (req, res) => {
      try {
        const verfahrenId = parsePositiveNumber(req.query?.verfahren_id);
        const rundeId = parsePositiveNumber(req.query?.runde_id);
        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
        if (!rundeId) return sendError(res, 400, "Ungueltige Runden-ID.");

        const report = await buildOffeneAnmeldungenReport(getPool(), verfahrenId, rundeId);
        return res.json({
          title: "Schueler mit offenem Anmeldestatus",
          verfahren: {
            id: report.procedure.id,
            bezeichnung: report.procedure.bezeichnung || "",
            schuljahr: report.procedure.schuljahr || "",
          },
          runde: {
            id: report.round.id,
            bezeichnung: report.round.bezeichnung || "",
            runden_nummer: report.round.runden_nummer || 0,
          },
          generated_at: report.generated_at,
          total: report.rows.length,
          rows: report.rows,
        });
      } catch (error) {
        console.error(error);
        return sendError(
          res,
          error?.statusCode || 500,
          error?.message || "Die Liste der offenen Anmeldestatus konnte nicht geladen werden.",
        );
      }
    },

    poolSchuelerAktuelleRunde: async (req, res) => {
      try {
        const verfahrenId = parsePositiveNumber(req.query?.verfahren_id);
        const rundeId = parsePositiveNumber(req.query?.runde_id);
        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
        if (!rundeId) return sendError(res, 400, "Ungueltige Runden-ID.");

        const report = await buildPoolSchuelerAktuelleRundeReport(getPool(), verfahrenId, rundeId);
        return res.json({
          title: "Schueler der aktuellen Runde mit Herkunft Pool",
          verfahren: {
            id: report.procedure.id,
            bezeichnung: report.procedure.bezeichnung || "",
            schuljahr: report.procedure.schuljahr || "",
          },
          runde: {
            id: report.round.id,
            bezeichnung: report.round.bezeichnung || "",
            runden_nummer: report.round.runden_nummer || 0,
          },
          generated_at: report.generated_at,
          total: report.rows.length,
          rows: report.rows,
        });
      } catch (error) {
        console.error(error);
        return sendError(
          res,
          error?.statusCode || 500,
          error?.message || "Die Liste der Pool-Schueler konnte nicht geladen werden.",
        );
      }
    },

    schuelerNachHerkunftsschule: async (req, res) => {
      try {
        const verfahrenId = parsePositiveNumber(req.query?.verfahren_id);
        const rundeId = parsePositiveNumber(req.query?.runde_id);
        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
        if (!rundeId) return sendError(res, 400, "Ungueltige Runden-ID.");

        const report = await buildSchuelerNachHerkunftsschuleReport(getPool(), verfahrenId, rundeId);
        return res.json({
          title: "Schueler nach Herkunftsschule mit Zielschule",
          verfahren: {
            id: report.procedure.id,
            bezeichnung: report.procedure.bezeichnung || "",
            schuljahr: report.procedure.schuljahr || "",
          },
          runde: {
            id: report.round.id,
            bezeichnung: report.round.bezeichnung || "",
            runden_nummer: report.round.runden_nummer || 0,
          },
          generated_at: report.generated_at,
          total: report.rows.length,
          rows: report.rows,
        });
      } catch (error) {
        console.error(error);
        return sendError(
          res,
          error?.statusCode || 500,
          error?.message || "Die Liste nach Herkunftsschule konnte nicht geladen werden.",
        );
      }
    },

    generate: async (req, res) => {
      const verfahrenId = parsePositiveNumber(req.body?.verfahren_id);
      const rundeId = parsePositiveNumber(req.body?.runde_id);
      const bereich = normalizeText(req.body?.bereich);
      const auswertung = normalizeText(req.body?.auswertung);
      const format = normalizeText(req.body?.format).toLowerCase();

      if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
      if (!rundeId) return sendError(res, 400, "Ungueltige Runden-ID.");
      if (!bereich) return sendError(res, 400, "Bereich ist erforderlich.");
      if (!auswertung) return sendError(res, 400, "Auswertung ist erforderlich.");
      if (!["pdf", "excel", "word"].includes(format)) {
        return sendError(res, 400, "Ausgabeformat ist ungueltig.");
      }

      const card = CARD_DEFINITIONS.find((entry) => entry.id === bereich);
      if (!card) return sendError(res, 404, "Auswertungsbereich nicht gefunden.");
      if (!card.formats.includes(format)) {
        return sendError(res, 400, "Dieses Ausgabeformat ist fuer den Bereich nicht verfuegbar.");
      }

      const option = card.options.find((entry) => entry.key === auswertung);
      if (!option) return sendError(res, 404, "Auswertung nicht gefunden.");

      res.json({
        placeholder: true,
        message: `Die Auswertung '${option.label}' fuer '${card.title}' als ${format.toUpperCase()} ist vorbereitet, aber noch nicht fachlich implementiert.`,
        request: {
          verfahrenId,
          rundeId,
          bereich,
          auswertung,
          format,
        },
      });
    },

    download: async (req, res) => {
      try {
        const verfahrenId = parsePositiveNumber(req.body?.verfahren_id);
        const rundeId = parsePositiveNumber(req.body?.runde_id);
        const bereich = normalizeText(req.body?.bereich);
        const auswertung = normalizeText(req.body?.auswertung);
        const format = normalizeText(req.body?.format).toLowerCase();

        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
        if (!rundeId) return sendError(res, 400, "Ungueltige Runden-ID.");
        if (!bereich) return sendError(res, 400, "Bereich ist erforderlich.");
        if (!auswertung) return sendError(res, 400, "Auswertung ist erforderlich.");
        if (!["pdf", "excel", "word"].includes(format)) {
          return sendError(res, 400, "Ausgabeformat ist ungueltig.");
        }

        const download = await createAuswertungDownload({
          pool: getPool(),
          verfahrenId,
          rundeId,
          bereich,
          auswertung,
          format,
        });

        if (!download) {
          return sendError(res, 409, "Diese Auswertung ist als echter Export noch nicht implementiert.");
        }

        res.setHeader("Content-Type", download.contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${download.fileName}"`);
        return res.send(download.buffer);
      } catch (error) {
        console.error(error);
        return sendError(
          res,
          error?.statusCode || 500,
          error?.message || "Die Auswertung konnte nicht heruntergeladen werden.",
        );
      }
    },
  };
}

module.exports = createAuswertungenController;
