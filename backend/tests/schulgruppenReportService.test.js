const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSchulgruppenCsv,
  mapSchoolGroupRow,
} = require("../lib/schulgruppenReportService");

test("mapSchoolGroupRow berechnet freie Plaetze und behaelt Nullwerte als Zahlen", () => {
  const row = mapSchoolGroupRow({
    snr: " 123456 ",
    schule: " Gesamtschule Mitte ",
    jahrgang: "5, 6",
    gesamtkapazitaet: "120",
    maximale_klassen: "4",
    anmeldungen_gesamt: "93",
    warteliste: "7",
    le: "5",
    zd: "2",
  });

  assert.deepEqual(row, {
    snr: "123456",
    schule: "Gesamtschule Mitte",
    jahrgang: "5, 6",
    gesamtkapazitaet: 120,
    maximale_klassen: 4,
    anmeldungen_gesamt: 93,
    freie_plaetze: 27,
    warteliste: 7,
    le: 5,
    zd: 2,
  });
});

test("buildSchulgruppenCsv erzeugt die geforderte Spaltenfolge", () => {
  const report = {
    rows: [mapSchoolGroupRow({ snr: "123456", schule: "Schule", jahrgang: "5" })],
  };
  const csv = buildSchulgruppenCsv(report);

  assert.deepEqual(csv.rows[0], [
    "SNR",
    "Schule",
    "Jahrgang",
    "Gesamt-Kapazitaet",
    "Max. Klassen",
    "Anmeldungen-Gesamt",
    "Freie Plaetze",
    "Warteliste",
    "LE",
    "ZD",
  ]);
  assert.deepEqual(csv.rows[1], ["123456", "Schule", "5", 0, 0, 0, 0, 0, 0, 0]);
});
