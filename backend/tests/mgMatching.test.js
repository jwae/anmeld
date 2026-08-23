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

test("MG-Matching unterscheidet exakten Treffer, Schreibfehler und neuen Schueler", async () => {
  const pool = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT id, status FROM anm_verfahren")) return [[{ id: 23, status: "In Bearbeitung" }]];
      if (normalized.startsWith("SELECT id, verfahren_id, status FROM anm_runde")) return [[{ id: 51, verfahren_id: 23, status: "In Bearbeitung" }]];
      if (normalized.startsWith("SELECT verfahrenstyp FROM anm_verfahren")) return [[{ verfahrenstyp: "SEK1" }]];
      if (normalized.includes("FROM anm_schueler") && normalized.includes("DATE_FORMAT(geburtsdatum")) {
        return [[{
          id: 1,
          nachname: "Meyer",
          vorname: "Anna",
          geburtsdatum: "2015-01-01",
          anmeldeschule_snr: null,
          anmeldestatus: "Ohne",
          foerderbedarf: 0,
          empfehlung: "RS",
          herkunftsschule_snr: null,
        }]];
      }
      if (normalized.includes("FROM ( SELECT DISTINCT sgs.snr")) {
        return [[{ snr: "159529", name: "Zielschule", is_active: 1 }]];
      }
      if (normalized === "SELECT snr, name FROM anm_schulen") return [[{ snr: "159529", name: "Zielschule" }]];
      if (normalized.startsWith("UPDATE anm_schueler SET")) return [{ affectedRows: 1 }];
      if (normalized.startsWith("INSERT INTO anm_schueler")) return [{ affectedRows: 1, insertId: 2 }];
      throw new Error(`Unerwartete Abfrage: ${normalized}`);
    },
    async getConnection() { return this; },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const controller = createImporteController({ getPool: () => pool });
  const response = createResponse();
  const base = { "SNr-Aufn.": "159529", "GL-Status": "", Status: "Neuaufnahme" };

  await controller.rueckmeldungenMgValidate({
    body: {
      verfahren_id: 23,
      runde_id: 51,
      headers: ["SNr-Aufn.", "Name", "Vorname", "Geboren", "GL-Status", "Status"],
      rows: [
        { ...base, Name: "Meyer", Vorname: "Anna", Geboren: "01.01.2015", __row_number: 2 },
        { ...base, Name: "Meier", Vorname: "Anna", Geboren: "01.01.2015", __row_number: 3 },
        { ...base, Name: "Neumann", Vorname: "Lisa", Geboren: "02.02.2016", __row_number: 4 },
      ],
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.rows.map((row) => row.classification), ["OK", "ABWEICHUNG", "NEU"]);
  assert.equal(response.payload.summary.importable, 2);
  assert.equal(response.payload.summary.new_students, 1);
  assert.equal(response.payload.summary.possible_typos, 1);
  assert.match(response.payload.rows[2].data.schueler_id, /^MG-[a-f0-9]{14}$/);

  const executeResponse = createResponse();
  await controller.rueckmeldungenMgExecute({
    body: {
      verfahren_id: 23,
      runde_id: 51,
      validation_token: response.payload.validation_token,
    },
  }, executeResponse);
  assert.equal(executeResponse.statusCode, 201);
  assert.equal(executeResponse.payload.updated, 1);
  assert.equal(executeResponse.payload.inserted, 1);
  assert.equal(executeResponse.payload.skipped, 1);
});
