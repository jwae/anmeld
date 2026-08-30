const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REPORT_DEFINITIONS,
  buildSchulenCsv,
  columnsForReport,
} = require("../lib/schulenReportService");

test("alle Untermenues der Schulauswertung sind definiert", () => {
  assert.deepEqual(Object.keys(REPORT_DEFINITIONS), [
    "anmeldungen-je-schule",
    "zugeordnete-schueler",
    "freie-plaetze",
    "kapazitaetsuebersicht",
  ]);
});

test("Schulkennzahlen enthalten Anmeldungen, Kapazitaet und freie Plaetze", () => {
  const report = {
    definition: REPORT_DEFINITIONS["anmeldungen-je-schule"],
    rows: [{
      snr: "100001",
      schule: "Gesamtschule Nord",
      schulform: "GE",
      anmeldungen: 80,
      neuaufnahmen: 60,
      warteliste: 10,
      zugeordnet: 5,
      kapazitaet: 90,
      reservierte_plaetze: 3,
      freie_plaetze: 27,
    }],
  };
  const csv = buildSchulenCsv(report);

  assert.equal(csv.rows[0].includes("Anmeldungen"), true);
  assert.equal(csv.rows[0].includes("Kapazitaet"), true);
  assert.equal(csv.rows[0].includes("Freie Plaetze"), true);
  assert.equal(csv.rows[1][0], "100001");
});

test("Kapazitaetsuebersicht ist nach Jahrgang exportierbar", () => {
  const report = { definition: REPORT_DEFINITIONS.kapazitaetsuebersicht, rows: [] };
  const keys = columnsForReport(report).map((column) => column[0]);

  assert.equal(keys.includes("jahrgang"), true);
  assert.equal(keys.includes("verfuegbare_plaetze"), true);
});
