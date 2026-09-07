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

for (const scenario of [
  { source: "SCHULE", schools: ["100001", "100002"], duplicate: false },
  { source: "SCHULE", schools: ["100001", "100001"], duplicate: true },
  { source: "POOL", schools: ["100001", "100002"], duplicate: true },
]) {
  test(`Pool-CSV prueft vollstaendige Identitaet: ${scenario.source}, ${scenario.schools.join('/')}`, async () => {
    const pool = { async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT verfahrenstyp')) return [[{ verfahrenstyp: 'GS' }]];
      if (normalized.startsWith('SELECT code, bezeichnung FROM anm_kat_quelle')) return [[{ code: scenario.source }]];
      if (normalized.startsWith('SELECT COLUMN_NAME')) return [[...['strasse', 'plz', 'ort'].map(COLUMN_NAME => ({ COLUMN_NAME }))]];
      if (normalized.includes('FROM ( SELECT DISTINCT sgs.snr')) return [[{ snr: '100001' }, { snr: '100002' }]];
      if (normalized.includes('FROM anm_schueler_externe_id') || normalized.startsWith('SELECT * FROM anm_schueler')) return [[]];
      throw new Error(normalized);
    } };
    const response = createResponse();
    await createImporteController({ getPool: () => pool }).anmSchuelerImportValidate({ body: {
      verfahren_id: 9, runde_id: 4, source_art: scenario.source,
      mapping: { externe_schueler_id: 'id', source_school_snr: 'snr', vorname: 'vorname', nachname: 'nachname', geburtsdatum: 'geburtsdatum' },
      csv_rows: scenario.schools.map((snr, index) => ({ row_number: index + 2, record: {
        id: '4711', snr, vorname: `Kind${index}`, nachname: 'Beispiel', geburtsdatum: '2020-01-01',
      } })),
    } }, response);
    assert.equal(response.statusCode, 200);
    assert.ok(response.payload.rows.every(row => row.errors.some(error => error.includes('doppelt')) === scenario.duplicate));
    if (!scenario.duplicate) assert.ok(response.payload.rows.every(row => row.status === 'gueltig'));
  });
}

test("CSV-Umlaut-Treffer erzeugt einen Hinweis und ist zunächst deaktiviert", async () => {
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT verfahrenstyp FROM anm_verfahren")) {
        return [[{ verfahrenstyp: "GS" }], []];
      }
      if (normalized.startsWith("SELECT code, bezeichnung FROM anm_kat_quelle")) {
        return [[{ code: "POOL", bezeichnung: "Pool" }], []];
      }
      if (normalized.startsWith("SELECT COLUMN_NAME FROM information_schema.COLUMNS")) {
        assert.equal(params[0], "anm_schueler");
        return [["strasse", "plz", "ort"].map((COLUMN_NAME) => ({ COLUMN_NAME })), []];
      }
      if (normalized.includes("FROM ( SELECT DISTINCT sgs.snr")) return [[], []];
      if (normalized.startsWith("SELECT * FROM anm_schueler WHERE verfahren_id") && normalized.includes("LOWER(TRIM")) {
        return [[], []];
      }
      if (normalized.startsWith("SELECT * FROM anm_schueler WHERE verfahren_id") && !normalized.includes("LOWER(TRIM")) {
        return [[{
          id: 17,
          verfahren_id: 9,
          vorname: "Jörg",
          nachname: "Müller",
          geburtsdatum: new Date(2015, 3, 3),
          strasse: "Bestandsweg 2",
          plz: "12345",
          ort: "Bestandsort",
          herkunft: "Pool",
        }], []];
      }
      throw new Error(`Unerwartete Abfrage: ${normalized}`);
    },
  };
  const controller = createImporteController({ getPool: () => pool });
  const response = createResponse();

  await controller.anmSchuelerImportValidate({
    body: {
      verfahren_id: 9,
      runde_id: 4,
      import_art: "pool",
      source_art: "POOL",
      mapping: {
        vorname: "Vorname",
        nachname: "Nachname",
        geburtsdatum: "Geburtsdatum",
        strasse: "Strasse",
        plz: "PLZ",
        ort: "Ort",
      },
      csv_rows: [{
        row_number: 2,
        record: {
          Vorname: "Joerg",
          Nachname: "Mueller",
          Geburtsdatum: "3.4.2015",
          Strasse: "",
          PLZ: "",
          Ort: "",
        },
      }],
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.rows.length, 1);
  assert.equal(response.payload.rows[0].import_action, "UPDATE");
  assert.equal(response.payload.rows[0].selected, false);
  assert.equal(response.payload.rows[0].status, "warnung");
  assert.match(response.payload.rows[0].warnings.join(" "), /Umlaut-Matching/);
  assert.match(response.payload.rows[0].warnings.join(" "), /Bisheriger Name: Müller, Jörg/);
  assert.match(response.payload.rows[0].warnings.join(" "), /Importname: Mueller, Joerg/);
  assert.equal(response.payload.rows[0].changed_fields.includes("strasse"), false);
  assert.equal(response.payload.rows[0].changed_fields.includes("plz"), false);
  assert.equal(response.payload.rows[0].changed_fields.includes("ort"), false);
});

test("Ein exakter vorhandener Datensatz wird in Schritt 4 nicht als neu angezeigt", async () => {
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT verfahrenstyp FROM anm_verfahren")) {
        return [[{ verfahrenstyp: "GS" }], []];
      }
      if (normalized.startsWith("SELECT code, bezeichnung FROM anm_kat_quelle")) {
        return [[{ code: "POOL", bezeichnung: "Pool" }], []];
      }
      if (normalized.startsWith("SELECT COLUMN_NAME FROM information_schema.COLUMNS")) {
        return [["strasse", "plz", "ort"].map((COLUMN_NAME) => ({ COLUMN_NAME })), []];
      }
      if (normalized.includes("FROM ( SELECT DISTINCT sgs.snr")) return [[], []];
      if (normalized.startsWith("SELECT * FROM anm_schueler WHERE verfahren_id") && normalized.includes("LOWER(TRIM")) {
        assert.deepEqual(params, [9, "Anna", "Beispiel", "2015-04-03"]);
        return [[{
          id: 18,
          verfahren_id: 9,
          vorname: "Anna",
          nachname: "Beispiel",
          geburtsdatum: new Date(2015, 3, 3),
          strasse: "Bestandsweg 2",
          plz: "12345",
          ort: "Bestandsort",
          herkunft: "Pool",
        }], []];
      }
      throw new Error(`Unerwartete Abfrage: ${normalized}`);
    },
  };
  const controller = createImporteController({ getPool: () => pool });
  const response = createResponse();

  await controller.anmSchuelerImportValidate({
    body: {
      verfahren_id: 9,
      runde_id: 4,
      import_art: "pool",
      source_art: "POOL",
      mapping: {
        vorname: "Vorname",
        nachname: "Nachname",
        geburtsdatum: "Geburtsdatum",
        ort: "Ort",
      },
      csv_rows: [{
        row_number: 2,
        record: {
          Vorname: "Anna",
          Nachname: "Beispiel",
          Geburtsdatum: "3.4.2015",
          Ort: "Neuer Ort",
        },
      }],
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.rows[0].import_action, "UPDATE");
  assert.equal(response.payload.rows[0].selected, true);
  assert.deepEqual(response.payload.rows[0].changed_fields, ["ort"]);
});

test("Anmeldungsimport erkennt exakte Personendaten in Schritt 4 als UPDATE", async () => {
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT verfahrenstyp FROM anm_verfahren")) {
        return [[{ verfahrenstyp: "GS" }], []];
      }
      if (normalized.includes("FROM ( SELECT DISTINCT sgs.snr")) {
        return [[{ snr: "123456", name: "Grundschule", is_active: 1 }], []];
      }
      if (normalized.startsWith("SELECT * FROM anm_schueler WHERE verfahren_id") && normalized.includes("LOWER(TRIM")) {
        assert.deepEqual(params, [9, "Anna", "Beispiel", "2015-04-03"]);
        return [[{
          id: 18,
          verfahren_id: 9,
          vorname: "Anna",
          nachname: "Beispiel",
          geburtsdatum: new Date(2015, 3, 3),
          herkunft: "Pool",
        }], []];
      }
      if (normalized.includes("FROM anm_schueler s LEFT JOIN anm_schueler_runde sr")) {
        assert.equal(params.at(-1), 18);
        return [[{
          id: 18,
          externe_schueler_id: "",
          anmeldeschule_snr: "",
          vorname: "Anna",
          nachname: "Beispiel",
          geburtsdatum: "2015-04-03",
          herkunft: "Pool",
          abgleich_status: "Nur Pool",
          anmeldestatus: "Ohne",
        }], []];
      }
      throw new Error(`Unerwartete Abfrage: ${normalized}`);
    },
  };
  const controller = createImporteController({ getPool: () => pool });
  const response = createResponse();

  await controller.anmSchuelerAnmeldungenValidate({
    body: {
      verfahren_id: 9,
      runde_id: 4,
      mapping: {
        anmeldeschule_snr: "SNr",
        anmeldestatus: "Status",
        vorname: "Vorname",
        nachname: "Nachname",
        geburtsdatum: "Geburtsdatum",
        empfehlung: "Empfehlung",
      },
      status_mapping: { Neu: "Neuaufnahme" },
      csv_rows: [{
        row_number: 2,
        record: {
          SNr: "123456",
          Status: "Neu",
          Vorname: "Anna",
          Nachname: "Beispiel",
          Geburtsdatum: "3.4.2015",
          Empfehlung: "G",
        },
      }],
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.rows[0].import_action, "UPDATE");
  assert.equal(response.payload.rows[0].selected, true);
  assert.equal(response.payload.rows[0].data.empfehlung, "GY");
  assert.equal(response.payload.rows[0].data.has_empfehlung, true);
});
