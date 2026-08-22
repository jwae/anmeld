const test = require("node:test");
const assert = require("node:assert/strict");
const createImporteController = require("../controllers/importeController");

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("Schuelerdaten werden ausschliesslich fuer das angegebene Verfahren geloescht", async () => {
  const deleteQueries = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT id, status FROM anm_verfahren")) return [[{ id: 17, status: "In Bearbeitung" }]];
      if (normalized.startsWith("SELECT COUNT(*) AS beendete_runden")) return [[{ beendete_runden: 0 }]];
      if (normalized.includes("information_schema.COLUMNS")) {
        const tableName = params[0];
        if (tableName === "anm_schueler_pool") return [[{ COLUMN_NAME: "id" }]];
        if (["anm_schueler_abgleich", "anm_offener_fall", "anm_merkzettel", "anm_anmeldung"].includes(tableName)) {
          return [[{ COLUMN_NAME: "verfahren_id" }, { COLUMN_NAME: "schueler_pool_id" }]];
        }
        return [[{ COLUMN_NAME: "verfahren_id" }]];
      }
      if (normalized.startsWith("SELECT DISTINCT schueler_pool_id AS id")) return [[{ id: 88 }]];
      if (normalized.startsWith("DELETE ")) {
        deleteQueries.push({ sql: normalized, params });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unerwartete Abfrage: ${normalized}`);
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const controller = createImporteController({ getPool: () => ({ getConnection: async () => connection }) });
  const response = createResponse();

  await controller.clearSchuelerDaten({ query: { verfahren_id: "17" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.verfahren_id, 17);
  assert.equal(deleteQueries.length, 7);
  assert.ok(deleteQueries.some((entry) => entry.sql.startsWith("DELETE FROM anm_merkzettel")));
  for (const entry of deleteQueries.filter((item) => item.sql.startsWith("DELETE FROM"))) {
    assert.match(entry.sql, / WHERE verfahren_id = \?$/);
    assert.deepEqual(entry.params, [17]);
  }
  const legacyPoolDelete = deleteQueries.find((entry) => entry.sql.startsWith("DELETE p FROM anm_schueler_pool"));
  assert.ok(legacyPoolDelete);
  assert.match(legacyPoolDelete.sql, /NOT EXISTS/);
  assert.deepEqual(legacyPoolDelete.params, [[88]]);
});

test("verfahren_id ist fuer die Loeschung verpflichtend", async () => {
  const controller = createImporteController({
    getPool: () => { throw new Error("Ohne verfahren_id darf keine DB-Verbindung angefordert werden."); },
  });
  const response = createResponse();

  await controller.clearSchuelerDaten({ query: {} }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.error, "verfahren_id ist erforderlich.");
});
