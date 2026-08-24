const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROTOKOLL_ERGEBNIS,
  getClientIp,
  writeProtokoll,
} = require("../lib/protokollService");

test("getClientIp normalisiert IPv4-Adressen im IPv6-Format", () => {
  assert.equal(getClientIp({ socket: { remoteAddress: "::ffff:192.0.2.10" } }), "192.0.2.10");
  assert.equal(getClientIp({ socket: { remoteAddress: "2001:db8::1" } }), "2001:db8::1");
});

test("writeProtokoll schreibt das Ereignis ueber den Katalogcode", async () => {
  let capturedSql = "";
  let capturedValues = [];
  const pool = {
    async query(sql, values) {
      capturedSql = sql;
      capturedValues = values;
      return [{ affectedRows: 1, insertId: 42 }];
    },
  };

  const id = await writeProtokoll(pool, {
    ereignisCode: "LOGIN",
    ergebnis: PROTOKOLL_ERGEBNIS.FEHLER,
    benutzerId: 10,
    benutzername: "admin",
    details: { grund: "UNGUELTIGE_ZUGANGSDATEN" },
    ipAdresse: "192.0.2.10",
  });

  assert.equal(id, 42);
  assert.match(capturedSql, /INSERT INTO app_protokoll/);
  assert.match(capturedSql, /FROM anm_kat_ereignisse/);
  assert.equal(capturedValues[0], "FEHLER");
  assert.equal(capturedValues[1], 10);
  assert.equal(capturedValues[2], "admin");
  assert.equal(capturedValues[8], JSON.stringify({ grund: "UNGUELTIGE_ZUGANGSDATEN" }));
  assert.equal(capturedValues[9], "192.0.2.10");
  assert.equal(capturedValues[11], "LOGIN");
});

test("writeProtokoll lehnt unbekannte oder inaktive Ereignisse ab", async () => {
  const pool = {
    async query() {
      return [{ affectedRows: 0, insertId: 0 }];
    },
  };

  await assert.rejects(
    writeProtokoll(pool, {
      ereignisCode: "UNBEKANNT",
      ergebnis: PROTOKOLL_ERGEBNIS.ERFOLG,
    }),
    /Aktives Protokollereignis nicht gefunden/,
  );
});
