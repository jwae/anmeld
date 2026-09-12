const test = require("node:test");
const assert = require("node:assert/strict");
const {
  changedFields,
  createVerfahrensProtokoll,
  snapshot,
} = require("../lib/verfahrensProtokoll");

test("verfahrensProtokoll bildet nur tatsaechlich geaenderte Felder ab", () => {
  assert.deepEqual(
    changedFields(
      { bezeichnung: "Alt", sichtbar: true, status: "Vorbereitet" },
      { bezeichnung: "Neu", sichtbar: true, status: "Vorbereitet" },
      ["bezeichnung", "sichtbar", "status"],
    ),
    { bezeichnung: { vorher: "Alt", nachher: "Neu" } },
  );
});

test("verfahrensProtokoll uebergibt Benutzer, IP und Rundenbezug", async () => {
  let recorded = null;
  const protocol = createVerfahrensProtokoll(
    { user: { sub: 8, username: "verwaltung" }, socket: { remoteAddress: "::ffff:192.0.2.8" } },
    { name: "pool" },
    async (pool, entry) => { recorded = { pool, entry }; },
  );

  await protocol.write({
    ereignisCode: "RUNDE_GESTARTET",
    objektTyp: "RUNDE",
    objektId: 31,
    verfahrenId: 12,
    rundeId: 31,
  });

  assert.equal(recorded.pool.name, "pool");
  assert.deepEqual(recorded.entry, {
    ereignisCode: "RUNDE_GESTARTET",
    ergebnis: "ERFOLG",
    benutzerId: 8,
    benutzername: "verwaltung",
    ipAdresse: "192.0.2.8",
    objektTyp: "RUNDE",
    objektId: 31,
    verfahrenId: 12,
    rundeId: 31,
  });
});

test("Snapshots halten loeschbare Verfahrensdaten fest", () => {
  assert.deepEqual(
    snapshot({ id: 3, bezeichnung: "GS 2027", status: "Beendet" }, ["bezeichnung", "status"]),
    { bezeichnung: "GS 2027", status: "Beendet" },
  );
});
