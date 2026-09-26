const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("offene Faelle werden dauerhaft einer Runde zugeordnet", () => {
  const migration = read("migrations/034_add_round_to_open_cases.sql");
  assert.match(migration, /ADD COLUMN `runde_id` bigint\(20\) DEFAULT NULL/);
  assert.match(migration, /MODIFY COLUMN `runde_id` bigint\(20\) NOT NULL/);
  assert.match(
    migration,
    /FOREIGN KEY \(`runde_id`, `verfahren_id`\)[\s\S]*REFERENCES `anm_runde` \(`id`, `verfahren_id`\)/,
  );

  const abgleich = read("controllers/abgleichController.js");
  assert.match(abgleich, /WHERE verfahren_id = \?\s+AND f\.runde_id = \?/);
  assert.match(abgleich, /INSERT INTO anm_offener_fall \(\s+verfahren_id,\s+runde_id,/);

  const importe = read("controllers/importeController.js");
  assert.match(importe, /const whereParts = \["verfahren_id = \?", "runde_id = \?", "fallgrund_id = \?"\]/);
  assert.match(importe, /const insertColumns = \["verfahren_id", "runde_id", "fallgrund_id"\]/);

  const koordination = read("controllers/koordinationController.js");
  assert.match(koordination, /WHERE f\.verfahren_id = \?\s+AND f\.runde_id = \?\s+AND sr\.runde_id = \?/);
  assert.match(koordination, /WHERE id = \?\s+AND verfahren_id = \?\s+AND runde_id = \?/);
  assert.match(koordination, /UPDATE anm_offener_fall[\s\S]*WHERE id = \?\s+AND verfahren_id = \?\s+AND runde_id = \?/);

  const report = read("lib/offeneFaelleReportService.js");
  assert.match(report, /WHERE f\.verfahren_id = \?\s+AND f\.runde_id = \?\s+AND sr\.runde_id = \?/);
});
