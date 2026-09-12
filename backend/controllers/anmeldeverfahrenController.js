const model = require("../models/anmeldeverfahrenModel");
const roundModel = require("../models/anmelderundenModel");
const { changedFields, createVerfahrensProtokoll, snapshot } = require("../lib/verfahrensProtokoll");

const PROCEDURE_FIELDS = ["schuljahr", "bezeichnung", "verfahrenstyp", "status", "sichtbar"];
const ROUND_FIELDS = ["runden_nummer", "bezeichnung", "startdatum", "enddatum", "status"];

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
        const protokoll = createVerfahrensProtokoll(req, getPool());
        await protokoll.write({
          ereignisCode: "VERFAHREN_ERSTELLT",
          objektTyp: "VERFAHREN",
          objektId: row.id,
          verfahrenId: row.id,
          details: { nachher: snapshot(row, PROCEDURE_FIELDS) },
        });
        const initialRounds = await roundModel.listByVerfahrenId(getPool(), row.id);
        for (const round of initialRounds) {
          await protokoll.write({
            ereignisCode: "RUNDE_ERSTELLT",
            objektTyp: "RUNDE",
            objektId: round.id,
            verfahrenId: row.id,
            rundeId: round.id,
            details: { automatisch_angelegt: true, nachher: snapshot(round, ROUND_FIELDS) },
          });
        }
        res.status(201).json({
          message: "Anmeldeverfahren erfolgreich angelegt. Drei Runden wurden im Status 'Vorbereitet' angelegt.",
          row,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_ERSTELLT", objektTyp: "VERFAHREN",
        }, error);
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

        if (existing.status === "In Bearbeitung") {
          const changedLockedField = payload.schuljahr !== existing.schuljahr
            || payload.verfahrenstyp !== existing.verfahrenstyp
            || payload.sichtbar !== existing.sichtbar;
          if (changedLockedField) {
            return sendError(res, 409, "Bei aktiven Verfahren kann nur die Bezeichnung geaendert werden.");
          }
        }

        const row = await model.update(getPool(), id, payload);
        if (!row) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        await createVerfahrensProtokoll(req, getPool()).write({
          ereignisCode: "VERFAHREN_GEAENDERT",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          aenderungen: changedFields(existing, row, PROCEDURE_FIELDS),
        });

        res.json({
          message: "Anmeldeverfahren erfolgreich aktualisiert.",
          row,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_GEAENDERT", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
        }, error);
        sendError(res, 500, "Anmeldeverfahren konnte nicht aktualisiert werden.");
      }
    },

    updateVisibility: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");
        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        if (!["Vorbereitet", "Beendet"].includes(existing.status)) {
          return sendError(res, 409, "Die Sichtbarkeit kann nur bei vorbereiteten oder beendeten Verfahren geaendert werden.");
        }
        const sichtbar = toBoolean(req.body?.sichtbar, existing.sichtbar);
        const row = await model.updateVisibility(getPool(), id, sichtbar);
        await createVerfahrensProtokoll(req, getPool()).write({
          ereignisCode: "VERFAHREN_GEAENDERT",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          aenderungen: changedFields(existing, row, ["sichtbar"]),
        });
        res.json({
          message: sichtbar ? "Verfahren wurde eingeblendet." : "Verfahren wurde ausgeblendet.",
          row,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_GEAENDERT", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
        }, error);
        sendError(res, error?.statusCode || 500, error?.message || "Die Sichtbarkeit konnte nicht geaendert werden.");
      }
    },

    start: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const roundsBeforeStart = await roundModel.listByVerfahrenId(getPool(), id);
        const row = await model.startProcedure(getPool(), id);
        const protokoll = createVerfahrensProtokoll(req, getPool());
        await protokoll.write({
          ereignisCode: "VERFAHREN_GESTARTET",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          aenderungen: { status: { vorher: "Vorbereitet", nachher: row.status } },
          details: { arbeitsrunde_id: row.arbeitsrunde_id },
        });
        const startedRound = roundsBeforeStart.find((round) => Number(round.id) === Number(row.arbeitsrunde_id));
        if (startedRound) {
          await protokoll.write({
            ereignisCode: "RUNDE_GESTARTET",
            objektTyp: "RUNDE",
            objektId: startedRound.id,
            verfahrenId: id,
            rundeId: startedRound.id,
            aenderungen: { status: { vorher: startedRound.status, nachher: "In Bearbeitung" } },
            details: { durch_verfahrensstart: true },
          });
        }
        res.json({
          message: "Das Verfahren wurde gestartet. Runde 1 ist jetzt in Bearbeitung und als Arbeitsrunde gesetzt.",
          row,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_GESTARTET", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
        }, error);
        sendError(res, error?.statusCode || 500, error?.message || "Das Verfahren konnte nicht gestartet werden.");
      }
    },

    finish: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const roundsBeforeFinish = await roundModel.listByVerfahrenId(getPool(), id);
        const row = await model.finishProcedure(getPool(), id);
        const protokoll = createVerfahrensProtokoll(req, getPool());
        await protokoll.write({
          ereignisCode: "VERFAHREN_BEENDET",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          aenderungen: { status: { vorher: "In Bearbeitung", nachher: row.status } },
        });
        const finishedRound = roundsBeforeFinish.find((round) => round.status === "In Bearbeitung");
        if (finishedRound) {
          await protokoll.write({
            ereignisCode: "RUNDE_BEENDET",
            objektTyp: "RUNDE",
            objektId: finishedRound.id,
            verfahrenId: id,
            rundeId: finishedRound.id,
            aenderungen: { status: { vorher: "In Bearbeitung", nachher: "Beendet" } },
            details: { durch_verfahrensende: true },
          });
        }
        res.json({
          message: "Das Verfahren wurde beendet und ist jetzt nur noch dokumentarisch nutzbar.",
          row,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_BEENDET", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
        }, error);
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
        const before = await model.listProcedureSchoolGroups(getPool(), id);
        const result = await model.syncProcedureSchoolGroupsByRole(getPool(), id, "Quellschulen", schulgruppen);
        if (!result.exists) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        await createVerfahrensProtokoll(req, getPool()).write({
          ereignisCode: "VERFAHREN_GEAENDERT",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          aenderungen: changedFields(before, result.schoolGroups, ["quellschulen"]),
        });

        res.json({
          message: "Quellschulgruppen erfolgreich uebernommen.",
          schoolGroups: result.schoolGroups,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_GEAENDERT", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
          details: { bereich: "QUELLSCHULGRUPPEN" },
        }, error);
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
        const before = await model.listProcedureSchoolGroups(getPool(), id);
        const result = await model.syncProcedureSchoolGroupsByRole(getPool(), id, "Zielschulen", schulgruppen);
        if (!result.exists) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        await createVerfahrensProtokoll(req, getPool()).write({
          ereignisCode: "VERFAHREN_GEAENDERT",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          aenderungen: changedFields(before, result.schoolGroups, ["zielschulen"]),
        });

        res.json({
          message: "Zielschulgruppen erfolgreich uebernommen.",
          schoolGroups: result.schoolGroups,
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_GEAENDERT", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
          details: { bereich: "ZIELSCHULGRUPPEN" },
        }, error);
        sendError(res, error?.statusCode || 500, error?.message || "Zielschulgruppen konnten nicht gespeichert werden.");
      }
    },

    remove: async (req, res) => {
      try {
        const id = Number(req.params.id || 0);
        if (!id) return sendError(res, 400, "Ungueltige Verfahrens-ID.");

        const existing = await model.findById(getPool(), id);
        if (!existing) return sendError(res, 404, "Anmeldeverfahren nicht gefunden.");
        const rounds = await roundModel.listByVerfahrenId(getPool(), id);
        await model.removeProcedureCompletely(getPool(), id);
        const protokoll = createVerfahrensProtokoll(req, getPool());
        for (const round of rounds) {
          await protokoll.write({
            ereignisCode: "RUNDE_GELOESCHT",
            objektTyp: "RUNDE",
            objektId: round.id,
            verfahrenId: id,
            rundeId: round.id,
            details: { vorher: snapshot(round, ROUND_FIELDS), mit_verfahren_geloescht: true },
          });
        }
        await protokoll.write({
          ereignisCode: "VERFAHREN_GELOESCHT",
          objektTyp: "VERFAHREN",
          objektId: id,
          verfahrenId: id,
          details: { vorher: snapshot(existing, PROCEDURE_FIELDS) },
        });
        res.json({
          success: true,
          message: "Verfahren wurde vollstaendig geloescht.",
        });
      } catch (error) {
        console.error(error);
        await createVerfahrensProtokoll(req, getPool()).writeFailure({
          ereignisCode: "VERFAHREN_GELOESCHT", objektTyp: "VERFAHREN", objektId: req.params.id, verfahrenId: req.params.id,
        }, error);
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
