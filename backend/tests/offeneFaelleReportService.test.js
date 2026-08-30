const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOffeneFaelleCsv,
  mapOpenCaseRow,
} = require("../lib/offeneFaelleReportService");

test("offener Fall wird fuer Vorschau und CSV aufbereitet", () => {
  const row = mapOpenCaseRow({
    fall_id: 7,
    externe_schueler_id: "EXT-7",
    nachname: "Mustermann",
    vorname: "Mia",
    geburtsdatum: "2015-02-01",
    aktuelle_snr: "100001",
    aktuelle_schule: "Schule Nord",
    erwartete_snr: "100002",
    erwartete_schule: "Schule Sued",
    zugewiesene_snr: "100003",
    zugewiesene_schule: "Schule West",
    fallgrund_code: "ANMELDEFEHLER",
    fallgrund: "Anmeldefehler",
    fallstatus: "Offen",
    bemerkung: "Pruefen",
    updated_at: "2026-08-30 13:45:00",
  }, 0);

  assert.equal(row.lfd_nr, 1);
  assert.equal(row.name_vorname, "Mustermann, Mia");
  assert.equal(row.geburtsdatum, "01.02.2015");
  assert.equal(row.aktualisiert, "30.08.2026 13:45");

  const csv = buildOffeneFaelleCsv({ rows: [row] });
  assert.equal(csv.rows[0].includes("Fallgrund"), true);
  assert.equal(csv.rows[0].includes("Fallstatus"), true);
  assert.equal(csv.rows[1][1], 7);
});
