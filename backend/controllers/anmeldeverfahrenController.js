const model = require("../models/anmeldeverfahrenModel");

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseProcedurePayload(body = {}) {
  const schuljahr = normalizeText(body.schuljahr);
  const bezeichnung = normalizeText(body.bezeichnung);
  const status = normalizeText(body.status) || "geplant";
  return { schuljahr, bezeichnung, status };
}

function parseParticipatingSchoolsPayload(body = {}) {
  const schools = Array.isArray(body.schulen) ? body.schulen : [];
  return schools
    .map((entry) => {
      if (typeof entry === "string") return normalizeText(entry);
      if (entry && typeof entry === "object") return normalizeText(entry.snr);
      return "";
    })
    .filter(Boolean);
}

function validateProcedurePayload(payload) {
  if (!payload.schuljahr) return "Schuljahr darf nicht leer sein.";
  if (!payload.bezeichnung) return "Bezeichnung darf nicht leer sein.";
  if (!model.STATUS_VALUES.includes(payload.status)) {
    return `Status ist ungueltig. Erlaubt: ${model.STATUS_VALUES.join(", ")}.`;
  }
  return "";
}

function createAnmeldeverfahrenController({ getPool }) {
  return {
    list: async (_req, res) => {
      try {
        const rows = await model.listAll(getPool());
        res.json({ rows });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmeldeverfahren konnten nicht geladen werden.");
      }
    },

    getById: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
        const row = await model.findById(getPool(), id);
        if (!row) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        res.json(row);
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmeldeverfahren konnte nicht geladen werden.");
      }
    },

    create: async (req, res) => {
      try {
        const payload = parseProcedurePayload(req.body);
        const validationError = validateProcedurePayload(payload);
        if (validationError) return sendError(res, 400, validationError);

        const duplicate = await model.hasDuplicateSchoolYear(getPool(), payload.schuljahr);
        if (duplicate) {
          return sendError(res, 409, "Das Schuljahr ist bereits einem anderen Anmeldeverfahren zugeordnet.");
        }

        const row = await model.create(getPool(), payload);
        res.status(201).json({
          message: "Anmeldeverfahren erfolgreich angelegt.",
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmeldeverfahren konnte nicht angelegt werden.");
      }
    },

    update: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const payload = parseProcedurePayload(req.body);
        const validationError = validateProcedurePayload(payload);
        if (validationError) return sendError(res, 400, validationError);

        const duplicate = await model.hasDuplicateSchoolYear(getPool(), payload.schuljahr, id);
        if (duplicate) {
          return sendError(res, 409, "Das Schuljahr ist bereits einem anderen Anmeldeverfahren zugeordnet.");
        }

        const row = await model.update(getPool(), id, payload);
        if (!row) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        res.json({
          message: "Anmeldeverfahren erfolgreich aktualisiert.",
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmeldeverfahren konnte nicht aktualisiert werden.");
      }
    },

    listParticipatingSchools: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const row = await model.findById(getPool(), id);
        if (!row) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        const rows = await model.listParticipatingSchools(getPool(), id);
        res.json({ rows });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Beteiligte Schulen konnten nicht geladen werden.");
      }
    },

    syncParticipatingSchools: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const schulen = parseParticipatingSchoolsPayload(req.body);
        const result = await model.syncParticipatingSchools(getPool(), id, schulen);
        if (!result.exists) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        res.json({
          message: "Beteiligte Schulen erfolgreich uebernommen.",
          rows: result.rows,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Beteiligte Schulen konnten nicht gespeichert werden.");
      }
    },

    remove: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const row = await model.findById(getPool(), id);
        if (!row) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        const blockers = await model.countBlockingDependencies(getPool(), id);
        if (blockers.length) {
          const details = blockers
            .map((blocker) => `${blocker.label}: ${blocker.count}`)
            .join(", ");
          return sendError(
            res,
            409,
            "Das Anmeldeverfahren kann nicht geloescht werden, weil noch abhaengige Daten vorhanden sind.",
            details,
          );
        }

        await model.removeWithRounds(getPool(), id);
        res.json({ message: "Anmeldeverfahren erfolgreich geloescht." });
      } catch (error) {
        console.error(error);
        sendError(res, 500, "Anmeldeverfahren konnte nicht geloescht werden.");
      }
    },
  };
}

module.exports = createAnmeldeverfahrenController;
