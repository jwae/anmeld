const { PROTOKOLL_ERGEBNIS, writeProtokoll } = require("./protokollService");

// Fachliche Felder aus Stamm- und Rundendaten. Technische Zeitstempel bleiben bewusst ausgenommen.
const FACHLICHE_FELDER = [
  "vorname", "nachname", "geburtsdatum", "strasse", "plz", "ort", "empfehlung",
  "foerderbedarf", "foerder_id", "zieldifferent", "ef", "notiz", "herkunft", "herkunftsschule_snr",
  "anmeldestatus", "teilnahmestatus", "schul_nr", "koordinierte_snr", "abgleich_status",
];

function comparable(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number(value);
  return String(value).trim();
}

function compareStudent(before = {}, after = {}) {
  return FACHLICHE_FELDER.reduce((changes, field) => {
    const alt = comparable(before[field]);
    const neu = comparable(after[field]);
    if (alt !== neu) changes[field] = { alt, neu };
    return changes;
  }, {});
}

function buildStudentProtocol({ before, after, context }) {
  const created = !before;
  const aenderungen = created ? {} : compareStudent(before, after);
  if (!created && !Object.keys(aenderungen).length) return null;
  return {
    ereignisCode: created ? "SCHUELER_ERSTELLT" : "SCHUELER_GEAENDERT",
    ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
    objektTyp: "SCHUELER",
    objektId: after.id,
    verfahrenId: after.verfahren_id,
    rundeId: after.runde_id,
    aenderungen: created ? null : aenderungen,
    details: { quelle: context?.quelle || "UNBEKANNT", aktion: context?.aktion || "IMPORT" },
    korrelationId: context?.korrelationId,
    benutzerId: context?.benutzerId,
    benutzername: context?.benutzername,
    ipAdresse: context?.ipAdresse,
  };
}

async function writeStudentProtocols(connection, entries) {
  for (const entry of entries.filter(Boolean)) await writeProtokoll(connection, entry);
}

module.exports = { FACHLICHE_FELDER, buildStudentProtocol, compareStudent, writeStudentProtocols };
