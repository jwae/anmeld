const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStudentProtocol, compareStudent } = require("../lib/schuelerProtokollService");

test("Schuelerprotokoll enthaelt nur fachliche Alt-Neu-Aenderungen", () => {
  const changes = compareStudent(
    { empfehlung: "RS", foerderbedarf: 0, updated_at: "alt" },
    { empfehlung: "GY", foerderbedarf: 1, updated_at: "neu" },
  );
  assert.deepEqual(changes, {
    empfehlung: { alt: "RS", neu: "GY" },
    foerderbedarf: { alt: 0, neu: 1 },
  });
});

test("unveraenderte Schuelerdaten erzeugen keinen Eintrag", () => {
  assert.equal(buildStudentProtocol({
    before: { id: 4, verfahren_id: 2, runde_id: 3, vorname: "Mia" },
    after: { id: 4, verfahren_id: 2, runde_id: 3, vorname: "Mia" },
    context: { quelle: "MANUELL", aktion: "BEARBEITEN" },
  }), null);
});

test("Importeintrag uebernimmt Kontext und Korrelation", () => {
  const entry = buildStudentProtocol({
    before: { id: 4, verfahren_id: 2, runde_id: 3, empfehlung: "RS" },
    after: { id: 4, verfahren_id: 2, runde_id: 3, empfehlung: "GY" },
    context: { quelle: "RUECKMELDUNG_MG", aktion: "IMPORT", korrelationId: "01234567-89ab-cdef-0123-456789abcdef" },
  });
  assert.equal(entry.ereignisCode, "SCHUELER_GEAENDERT");
  assert.deepEqual(entry.aenderungen, { empfehlung: { alt: "RS", neu: "GY" } });
  assert.equal(entry.korrelationId, "01234567-89ab-cdef-0123-456789abcdef");
});
