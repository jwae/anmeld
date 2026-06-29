const model = require("../models/anmelderundenModel");
const verfahrenModel = require("../models/anmeldeverfahrenModel");

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return text || null;
}

function parseRoundPayload(body = {}) {
  const roundNumber = Number(body.runden_nummer);
  return {
    runden_nummer: Number.isInteger(roundNumber) ? roundNumber : 0,
    bezeichnung: normalizeText(body.bezeichnung),
    startdatum: normalizeDate(body.startdatum),
    enddatum: normalizeDate(body.enddatum),
    status: normalizeText(body.status) || "Vorbereitet",
  };
}

function validateRoundPayload(payload, options = {}) {
  if (!Number.isInteger(payload.runden_nummer) || payload.runden_nummer <= 0) {
    return "Rundennummer muss eine positive ganze Zahl sein.";
  }
  if (!payload.bezeichnung) return "Bezeichnung darf nicht leer sein.";
  if (!model.STATUS_VALUES.includes(payload.status)) {
    return `Status ist ungueltig. Erlaubt: ${model.STATUS_VALUES.join(", ")}.`;
  }
  if (!options.allowAnyStatus && payload.status !== "Vorbereitet") {
    return "Neue Runden duerfen nur im Status 'Vorbereitet' angelegt werden.";
  }
  if (payload.startdatum && payload.enddatum && payload.startdatum > payload.enddatum) {
    return "Startdatum darf nicht nach dem Enddatum liegen.";
  }
  return "";
}

function createAnmelderundenController({ getPool }) {
  return {
    listByVerfahren: async (req, res) => {
      try {
        const verfahrenId = Number(req.params.verfahrenId || 0);
        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const exists = await model.existsForVerfahren(getPool(), verfahrenId);
        if (!exists) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        const rows = await model.listByVerfahrenId(getPool(), verfahrenId);
        res.json({ rows });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmelderunden konnten nicht geladen werden.");
      }
    },

    create: async (req, res) => {
      try {
        const verfahrenId = Number(req.params.verfahrenId || 0);
        if (!verfahrenId) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const verfahren = await verfahrenModel.findById(getPool(), verfahrenId);
        if (!verfahren) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (verfahren.status === "Beendet") {
          return sendError(res, 409, "Beendete Verfahren sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

        const payload = parseRoundPayload(req.body);
        const validationError = validateRoundPayload(payload);
        if (validationError) return sendError(res, 400, validationError);

        const duplicate = await model.hasDuplicateRoundNumber(
          getPool(),
          verfahrenId,
          payload.runden_nummer,
        );
        if (duplicate) {
          return sendError(res, 409, "Die Rundennummer ist in diesem Verfahren bereits vergeben.");
        }

        const row = await model.create(getPool(), verfahrenId, payload);
        res.status(201).json({
          message: "Anmelderunde erfolgreich angelegt.",
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmelderunde konnte nicht angelegt werden.");
      }
    },

    update: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Runden-ID.");

        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmelderunde nicht gefunden.");
        if (existing.status === "Beendet") {
          return sendError(res, 409, "Beendete Runden sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

        const verfahren = await verfahrenModel.findById(getPool(), existing.verfahren_id);
        if (!verfahren) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (verfahren.status === "Beendet") {
          return sendError(res, 409, "Beendete Verfahren sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

        const payload = parseRoundPayload(req.body);
        payload.status = existing.status;
        const validationError = validateRoundPayload(payload, { allowAnyStatus: true });
        if (validationError) return sendError(res, 400, validationError);

        const duplicate = await model.hasDuplicateRoundNumber(
          getPool(),
          existing.verfahren_id,
          payload.runden_nummer,
          id,
        );
        if (duplicate) {
          return sendError(res, 409, "Die Rundennummer ist in diesem Verfahren bereits vergeben.");
        }

        const row = await model.update(getPool(), id, payload);
        res.json({
          message: "Anmelderunde erfolgreich aktualisiert.",
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmelderunde konnte nicht aktualisiert werden.");
      }
    },

    remove: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Runden-ID.");

        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmelderunde nicht gefunden.");
        if (existing.status === "Beendet") {
          return sendError(res, 409, "Beendete Runden sind schreibgeschuetzt und koennen nicht geloescht werden.");
        }
        if (existing.ist_arbeitsrunde) {
          return sendError(res, 409, "Die aktuelle Arbeitsrunde kann nicht geloescht werden.");
        }

        const verfahren = await verfahrenModel.findById(getPool(), existing.verfahren_id);
        if (!verfahren) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (verfahren.status === "Beendet") {
          return sendError(res, 409, "Beendete Verfahren sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

        const blockers = await model.countBlockingDependencies(getPool(), id);
        if (blockers.length) {
          const details = blockers
            .map((blocker) => `${blocker.label}: ${blocker.count}`)
            .join(", ");
          return sendError(
            res,
            409,
            "Die Anmelderunde kann nicht geloescht werden, weil noch importierte oder protokollierte Daten daran haengen.",
            details,
          );
        }

        await model.remove(getPool(), id);
        res.json({ message: "Anmelderunde erfolgreich geloescht." });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmelderunde konnte nicht geloescht werden.");
      }
    },

    setWorkingRound: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Runden-ID.");

        const row = await model.setWorkingRound(getPool(), id);
        res.json({
          message: `Runde ${row.runden_nummer} ist jetzt die Arbeitsrunde.`,
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Die Arbeitsrunde konnte nicht gesetzt werden.");
      }
    },

    startRound: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Runden-ID.");

        const result = await model.startRound(getPool(), id);
        res.status(201).json({
          message: `Runde ${result.current_round.runden_nummer} wurde beendet und Runde ${result.next_round.runden_nummer} gestartet.`,
          ...result,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Der Rundenwechsel konnte nicht ausgefuehrt werden.");
      }
    },
  };
}

module.exports = createAnmelderundenController;
