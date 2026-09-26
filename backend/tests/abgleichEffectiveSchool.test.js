const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Abgleich verwendet koordinierte_snr als wirksame aufnehmende Schule", () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "..", "controllers", "abgleichController.js"),
    "utf8",
  );

  assert.match(
    controllerSource,
    /const EFFECTIVE_SCHOOL_COLUMN = "COALESCE\(NULLIF\(TRIM\(sr\.koordinierte_snr\), ''\), NULLIF\(TRIM\(sr\.schul_nr\), ''\)\)";/,
  );
  assert.equal(
    (controllerSource.match(/const schoolColumn = EFFECTIVE_SCHOOL_COLUMN;/g) || []).length,
    3,
    "Detailtabelle, Kennzahlen und Schuluebersicht muessen dieselbe wirksame Schule verwenden.",
  );
  assert.doesNotMatch(
    controllerSource,
    /const schoolColumn = "NULLIF\(TRIM\(sr\.schul_nr\), ''\)";/,
  );
});
