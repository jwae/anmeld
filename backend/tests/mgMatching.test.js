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
  const updateParameters = [];
  const updateStatements = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT id, status FROM anm_verfahren")) return [[{ id: 23, status: "In Bearbeitung" }]];
      if (normalized.startsWith("SELECT id, verfahren_id, status FROM anm_runde")) return [[{ id: 51, verfahren_id: 23, status: "In Bearbeitung" }]];
      if (normalized.startsWith("SELECT verfahrenstyp FROM anm_verfahren")) return [[{ verfahrenstyp: "SEK1" }]];
      if (normalized.includes("FROM anm_schueler s") && normalized.includes("DATE_FORMAT(s.geburtsdatum")) {
        return [[
          {
            id: 1,
            nachname: "Meyer",
            vorname: "Anna",
            geburtsdatum: "2015-01-01",
            anmeldeschule_snr: null,
            anmeldestatus: "Ohne",
            foerderbedarf: 0,
            empfehlung: "RS",
            herkunft: "Pool",
            abgleich_status: "Nur Pool",
            herkunftsschule_snr: null,
          },
          {
            id: 2,
            nachname: "Schulz",
            vorname: "Eva",
            geburtsdatum: "2015-03-03",
            anmeldeschule_snr: "159529",
            anmeldestatus: "Neuaufnahme",
            foerderbedarf: 0,
            empfehlung: "GY",
            herkunft: "Anmeldung",
            abgleich_status: "Nur Anmeldung",
            herkunftsschule_snr: null,
          },
        ]];
      }
      if (normalized.includes("FROM ( SELECT DISTINCT sgs.snr")) {
        return [[{ snr: "159529", name: "Zielschule", is_active: 1 }]];
      }
      if (normalized === "SELECT snr, name FROM anm_schulen") return [[{ snr: "159529", name: "Zielschule" }]];
      if (normalized.startsWith("SELECT * FROM anm_schueler WHERE verfahren_id")) return [[]];
      if (normalized.startsWith("SELECT * FROM anm_schueler_runde")) {
        if (Number(params[1]) === 3) return [[]];
        return [[{ id: Number(params[1]), verfahren_id: params[0], schueler_id: params[1], runde_id: params[2] }]];
      }
      if (normalized.startsWith("UPDATE anm_schueler SET")) {
        updateStatements.push(normalized);
        updateParameters.push(params);
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith("UPDATE anm_schueler_runde SET")) {
        updateStatements.push(normalized);
        updateParameters.push(params);
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith("INSERT INTO anm_schueler_runde")) return [{ affectedRows: 1, insertId: 3 }];
      if (normalized.startsWith("INSERT INTO anm_schueler")) return [{ affectedRows: 1, insertId: 3 }];
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
        { ...base, Name: "Schulz", Vorname: "Eva", Geboren: "03.03.2015", __row_number: 4 },
        { ...base, Name: "Neumann", Vorname: "Lisa", Geboren: "02.02.2016", __row_number: 5 },
      ],
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.rows.map((row) => row.classification), ["OK", "ABWEICHUNG", "OK", "NEU"]);
  assert.deepEqual(response.payload.rows.map((row) => row.abgleich_status), ["Pool + Anm", "Nur Anmeldung", "Nur Anmeldung", "Nur Anmeldung"]);
  assert.equal(response.payload.summary.importable, 3);
  assert.equal(response.payload.summary.new_students, 1);
  assert.equal(response.payload.summary.possible_typos, 1);
  assert.equal(response.payload.rows[3].data.schueler_id, undefined);

  const executeResponse = createResponse();
  await controller.rueckmeldungenMgExecute({
    body: {
      verfahren_id: 23,
      runde_id: 51,
      validation_token: response.payload.validation_token,
    },
  }, executeResponse);
  assert.equal(executeResponse.statusCode, 201);
  assert.equal(executeResponse.payload.updated, 2);
  assert.equal(executeResponse.payload.inserted, 1);
  assert.equal(executeResponse.payload.skipped, 1);
  assert.equal(updateStatements.filter((sql) => sql.startsWith("UPDATE anm_schueler_runde SET")).length, 2);
  assert.equal(updateStatements.some((sql) => /\bherkunft\s*=/.test(sql)), false);
  assert.equal(updateParameters.some((params) => params.includes("Pool + Anm")), true);
  assert.equal(updateParameters.some((params) => params.includes("Nur Anmeldung")), true);
});
