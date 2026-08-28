const test = require("node:test");
const assert = require("node:assert/strict");

const { buildStammdatenabweichungNote, formatGermanImportDate } = require("../lib/importCaseNote");

test("Import-Fallbemerkung formatiert Geburtsdaten deutsch und nennt die CSV-Datei", () => {
  const note = buildStammdatenabweichungNote({
    row_number: 12,
    changed_fields: ["vorname", "nachname", "geburtsdatum"],
    existing_data: {
      vorname: "Jörg",
      nachname: "Müller",
      geburtsdatum: new Date(2015, 3, 3),
    },
    data: {
      vorname: "Joerg",
      nachname: "Mueller",
      geburtsdatum: "2015-03-04",
    },
  }, "anmeldungen_2026.csv");

  assert.equal(
    note,
    "Zeile 12 | Stammdatenabweichung: Vorname: Jörg -> Joerg, Nachname: Müller -> Mueller, Geburtsdatum: 03.04.2015 -> 04.03.2015 | Datei: anmeldungen_2026.csv",
  );
  assert.equal(formatGermanImportDate("2020-01-09T00:00:00.000Z"), "09.01.2020");
  assert.equal(formatGermanImportDate("Fri Apr 03 2015 00:00:00 GMT+0200"), "03.04.2015");
  assert.equal(formatGermanImportDate("03.04.2015"), "03.04.2015");
});
