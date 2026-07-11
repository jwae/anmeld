const model = require("../models/anmeldeverfahrenModel");

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toBoolean(value, defaultValue = true) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "ja", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "nein", "no", "n"].includes(normalized)) return false;
  return defaultValue;
}

function parseProcedurePayload(body = {}) {
  const schuljahr = normalizeText(body.schuljahr);
  const bezeichnung = normalizeText(body.bezeichnung);
  const verfahrenstyp = normalizeText(body.verfahrenstyp) || "GS";
  const status = normalizeText(body.status) || "Vorbereitet";
  const sichtbar = toBoolean(body.sichtbar, true);
  return { schuljahr, bezeichnung, verfahrenstyp, status, sichtbar };
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

function validateProcedurePayload(payload, options = {}) {
  if (!payload.schuljahr) return "Schuljahr darf nicht leer sein.";
  if (!payload.bezeichnung) return "Bezeichnung darf nicht leer sein.";
  if (!model.VERFAHRENSTYP_VALUES.includes(payload.verfahrenstyp)) {
    return `Verfahrenstyp ist ungueltig. Erlaubt: ${model.VERFAHRENSTYP_VALUES.join(", ")}.`;
  }
  if (!model.STATUS_VALUES.includes(payload.status)) {
    return `Status ist ungueltig. Erlaubt: ${model.STATUS_VALUES.join(", ")}.`;
  }
  if (!options.allowNonPreparedCreate && !["Vorbereitet", "In Bearbeitung"].includes(payload.status)) {
    return "Neue Verfahren duerfen nur im Status 'Vorbereitet' oder 'In Bearbeitung' angelegt werden.";
  }
  return "";
}

function createAnmeldeverfahrenController({ getPool }) {
  return {
    list: async (req, res) => {
      try {
        const includeHidden = toBoolean(req.query?.includeHidden, false);
        const rows = await model.listAll(getPool(), { includeHidden });
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

        const row = await model.create(getPool(), payload);
        res.status(201).json({
          message: "Anmeldeverfahren erfolgreich angelegt. Drei Runden wurden im Status 'Vorbereitet' angelegt.",
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

        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (existing.status === "Beendet") {
          return sendError(res, 409, "Beendete Verfahren sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

        const payload = parseProcedurePayload(req.body);
        payload.status = existing.status;
        const validationError = validateProcedurePayload(payload, { allowNonPreparedCreate: true });
        if (validationError) return sendError(res, 400, validationError);

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

    start: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const row = await model.startProcedure(getPool(), id);
        res.json({
          message: "Das Verfahren wurde gestartet. Runde 1 ist jetzt in Bearbeitung und als Arbeitsrunde gesetzt.",
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Das Verfahren konnte nicht gestartet werden.");
      }
    },

    finish: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const row = await model.finishProcedure(getPool(), id);
        res.json({
          message: "Das Verfahren wurde beendet und ist jetzt nur noch dokumentarisch nutzbar.",
          row,
        });
      } catch (error) {
        console.error(error);
        sendError(res, error?.statusCode || 500, error?.message || "Das Verfahren konnte nicht beendet werden.");
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

        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (existing.status === "Beendet") {
          return sendError(res, 409, "Beendete Verfahren sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

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

        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (existing.status === "Beendet") {
          return sendError(res, 409, "Beendete Verfahren sind schreibgeschuetzt und koennen nicht bearbeitet werden.");
        }

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

        await model.removeProcedureCompletely(getPool(), id);
        res.json({
          success: true,
          message: "Verfahren wurde vollstaendig geloescht.",
        });
      } catch (error) {
        console.error(error);
        const statusCode = error?.statusCode || 500;
        const message = error?.message || "Anmeldeverfahren konnte nicht geloescht werden.";
        if (statusCode === 404 || statusCode === 409) {
          return res.status(statusCode).json({
            success: false,
            message,
            error: message,
          });
        }
        sendError(res, statusCode, message);
      }
    },
  };
}

module.exports = createAnmeldeverfahrenController;
