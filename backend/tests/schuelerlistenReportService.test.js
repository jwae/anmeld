const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REPORT_DEFINITIONS,
  buildSchuelerlisteCsv,
  isPositiveFlag,
} = require("../lib/schuelerlistenReportService");

test("Filter der Schuelerlisten bilden die fachlichen Statuswerte ab", () => {
  assert.equal(REPORT_DEFINITIONS.neuaufnahme.filter({ statusKey: "neuaufnahme" }), true);
  assert.equal(REPORT_DEFINITIONS.neuaufnahme.filter({ statusKey: "warteliste" }), false);
  assert.equal(REPORT_DEFINITIONS["zugeordnete-schueler"].filter({ statusKey: "zuordnung" }), true);
  assert.equal(REPORT_DEFINITIONS["zugeordnete-schueler"].filter({ statusKey: "zugeordnet" }), true);
  assert.equal(REPORT_DEFINITIONS["ohne-anmeldung"].filter({ statusKey: "" }), true);
  assert.equal(REPORT_DEFINITIONS["ohne-anmeldung"].filter({ statusKey: "ohne" }), true);
});

test("Foerderbedarf erkennt positive und negative Datenbankwerte", () => {
  assert.equal(isPositiveFlag("1"), true);
  assert.equal(isPositiveFlag("Ja"), true);
  assert.equal(isPositiveFlag("0"), false);
  assert.equal(isPositiveFlag("nein"), false);
  assert.equal(isPositiveFlag(""), false);
});

test("CSV-Export der Schuelerlisten enthaelt die Vorschau-Spalten", () => {
  const report = {
    rows: [{
      lfd_nr: 1,
      externe_schueler_id: "EXT-1",
      interne_schueler_id: 12,
      name_vorname: "Mustermann, Mia",
      geburtsdatum: "01.02.2015",
      abgebende_schule_nr: "100001",
      abgebende_schule_name: "Grundschule Mitte",
      anmeldestatus: "Neuaufnahme",
      schule: "Gesamtschule Nord",
      foerderbedarf: "Nein",
      zieldifferent: "Ja",
      bemerkung: "-",
    }],
  };
  const csv = buildSchuelerlisteCsv(report);

  assert.deepEqual(csv.rows[0], [
    "Lfd. Nr.",
    "Schueler-ID",
    "Name, Vorname",
    "Geb.-Dat.",
    "Nr. abg. Schule",
    "Name abgebende Schule",
    "Anmeldestatus",
    "Schule",
    "Foerderbedarf",
    "ZD",
    "Bemerkung",
  ]);
  assert.equal(csv.rows[1][1], "EXT-1");
  assert.equal(csv.rows[1][9], "Ja");
});
