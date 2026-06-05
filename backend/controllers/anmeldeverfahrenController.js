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
  const verfahrenstyp = normalizeText(body.verfahrenstyp) || "GS";
  const status = normalizeText(body.status) || "geplant";
  return { schuljahr, bezeichnung, verfahrenstyp, status };
}

function parseSchoolGroupsPayload(body = {}) {
  const schoolGroups = Array.isArray(body.schulgruppen)
    ? body.schulgruppen
    : Array.isArray(body.schulgruppeIds)
      ? body.schulgruppeIds
      : [];

  const normalizedSchoolGroups = Array.from(new Set(
    schoolGroups
      .map((entry) => {
        if (typeof entry === "number") return Number(entry);
        if (typeof entry === "string") return Number(normalizeText(entry));
        if (entry && typeof entry === "object") return Number(entry.id);
        return 0;
      })
      .filter((entry) => Number.isInteger(entry) && entry > 0),
  ));

  if (normalizedSchoolGroups.length > 1) {
    const error = new Error("Pro Rolle darf genau eine Schulgruppe je Verfahren uebergeben werden.");
    error.statusCode = 400;
    throw error;
  }

  return normalizedSchoolGroups;
}

function validateProcedurePayload(payload) {
  if (!payload.schuljahr) return "Schuljahr darf nicht leer sein.";
  if (!payload.bezeichnung) return "Bezeichnung darf nicht leer sein.";
  if (!model.VERFAHRENSTYP_VALUES.includes(payload.verfahrenstyp)) {
    return `Verfahrenstyp ist ungueltig. Erlaubt: ${model.VERFAHRENSTYP_VALUES.join(", ")}.`;
  }
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

    listSchoolGroups: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const row = await model.findById(getPool(), id);
        if (!row) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        const schoolGroups = await model.listProcedureSchoolGroups(getPool(), id);
        res.json(schoolGroups);
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Schulgruppen des Verfahrens konnten nicht geladen werden.");
      }
    },

    syncSourceSchoolGroups: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const schulgruppen = parseSchoolGroupsPayload(req.body);
        const result = await model.syncProcedureSchoolGroupsByRole(getPool(), id, "Quellschulen", schulgruppen);
        if (!result.exists) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        res.json({
          message: "Quellschulgruppen erfolgreich uebernommen.",
          schoolGroups: result.schoolGroups,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Quellschulgruppen konnten nicht gespeichert werden.");
      }
    },

    syncTargetSchoolGroups: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const schulgruppen = parseSchoolGroupsPayload(req.body);
        const result = await model.syncProcedureSchoolGroupsByRole(getPool(), id, "Zielschulen", schulgruppen);
        if (!result.exists) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");

        res.json({
          message: "Zielschulgruppen erfolgreich uebernommen.",
          schoolGroups: result.schoolGroups,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Zielschulgruppen konnten nicht gespeichert werden.");
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
