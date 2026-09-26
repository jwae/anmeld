import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/views/OffeneFaelleView.vue", import.meta.url), "utf8");

test("Offene Faelle zeigen Verfahren und Runde in einer eigenen Spalte", () => {
  assert.match(source, /<th>Verfahren<\/th>/);
  assert.match(source, /context\.verfahren \|\| `Verfahren \$\{row\.verfahren_id\}`/);
  assert.match(source, /context\.runde \|\| `Runde \$\{row\.runde_id\}`/);
  assert.doesNotMatch(source, /<th>.*Quelle.*<\/th>/);
  assert.doesNotMatch(source, /quelleBadgeClass\(row\.quelle\)/);
  assert.equal((source.match(/colspan="10"/g) || []).length, 3);
  assert.match(source, /if \(normalized\.includes\("offen"\)\) return "status-badge status-badge-without"/);
  assert.match(source, /\.status-badge-without\s*\{[^}]*background:\s*var\(--anm-danger-soft\);[^}]*color:\s*var\(--anm-danger\);/s);
});
