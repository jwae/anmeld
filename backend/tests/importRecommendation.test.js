const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeImportRecommendation, importRecommendationDiffers } = require("../lib/importRecommendation");

test("Empfehlungswerte aus Importdateien werden auf Katalogcodes gemappt", () => {
  assert.equal(normalizeImportRecommendation(" H ").value, "HS");
  assert.equal(normalizeImportRecommendation("r").value, "RS");
  assert.equal(normalizeImportRecommendation("ohne").value, "KEINE");
  assert.equal(normalizeImportRecommendation(" - ").value, "KEINE");
  assert.equal(normalizeImportRecommendation(" h/r ").value, "HS_RS");
  assert.equal(normalizeImportRecommendation("R/GY").value, "RS_GY");
});

test("Bereits interne Empfehlungscodes bleiben kompatibel", () => {
  for (const code of ["HS", "RS", "GY", "KEINE", "HS_RS", "RS_GY"]) {
    assert.deepEqual(normalizeImportRecommendation(code), { valid: true, value: code, normalized: code });
  }
});

test("Leere Werte werden auf KEINE gemappt und unbekannte Werte sind ungueltig", () => {
  assert.deepEqual(normalizeImportRecommendation("  "), { valid: true, value: "KEINE", normalized: "" });
  assert.deepEqual(normalizeImportRecommendation("unbekannt"), { valid: false, value: null, normalized: "UNBEKANNT" });
});

test("Empfehlungsabweichungen werden nur bei vorhandener Importspalte markiert", () => {
  assert.equal(importRecommendationDiffers("RS_GY", "RS_GY", true), false);
  assert.equal(importRecommendationDiffers(" rs_gy ", "RS_GY", true), false);
  assert.equal(importRecommendationDiffers("GY", "RS_GY", true), true);
  assert.equal(importRecommendationDiffers("GY", "RS_GY", false), false);
});
