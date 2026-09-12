const { PROTOKOLL_ERGEBNIS, getClientIp, writeProtokoll } = require("./protokollService");

function snapshot(value, fields) {
  return fields.reduce((result, field) => {
    result[field] = value?.[field] ?? null;
    return result;
  }, {});
}

function changedFields(before, after, fields) {
  return fields.reduce((result, field) => {
    const previous = before?.[field] ?? null;
    const next = after?.[field] ?? null;
    if (JSON.stringify(previous) !== JSON.stringify(next)) result[field] = { vorher: previous, nachher: next };
    return result;
  }, {});
}

function createVerfahrensProtokoll(req, pool, writeEntry = writeProtokoll) {
  async function write(entry) {
    try {
      await writeEntry(pool, {
        ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
        benutzerId: req.user?.sub,
        benutzername: req.user?.username,
        ipAdresse: getClientIp(req),
        ...entry,
      });
    } catch (error) {
      // Ein deaktiviertes oder fehlerhaftes Protokoll darf keine bereits
      // erfolgreiche fachliche Aenderung nachtraeglich als Fehler ausweisen.
      console.error("[PROTOKOLL] Eintrag konnte nicht gespeichert werden:", error?.message || error);
    }
  }

  async function writeFailure(entry, error) {
    await write({
      ...entry,
      ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
      details: {
        ...(entry.details || {}),
        grund: error?.statusCode ? "FACHLICHER_FEHLER" : "TECHNISCHER_FEHLER",
        meldung: String(error?.message || "Unbekannter Fehler").slice(0, 500),
      },
    });
  }

  return { write, writeFailure };
}

module.exports = { changedFields, createVerfahrensProtokoll, snapshot };
