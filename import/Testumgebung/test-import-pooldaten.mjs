/**
 * Integrations- und Regressionstest fuer "GS Schuelerpool importieren".
 * Nutzt wie das Import-Overlay schema -> validate -> execute. Es werden keine
 * Daten geloescht. TEST_* Variablen koennen alle Vorgaben ueberschreiben.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..', '..');
const backendRoot = path.join(projectRoot, 'backend');
const requireFromBackend = createRequire(path.join(backendRoot, 'package.json'));
const mysql = requireFromBackend('mysql2/promise');
const dotenv = requireFromBackend('dotenv');
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });
dotenv.config({ path: path.join(projectRoot, 'frontend', '.env.local'), quiet: true });

const CSV_FILE = path.join(testDir, 'schueler aus pool.csv');
const API_BASE = String(process.env.TEST_API_BASE || 'http://localhost:3000').replace(/\/$/, '');
const VERFAHREN_ID = Number(process.env.TEST_VERFAHREN_ID || 26);
const RUNDE_ID = Number(process.env.TEST_RUNDE_ID || 60);
const SOURCE_ART = String(process.env.TEST_QUELLE || process.env.TEST_SOURCE_ART || 'POOL').trim().toUpperCase();
const EXPECTED_VERFAHREN_NAME = String(process.env.TEST_EXPECTED_VERFAHREN_NAME || 'SEK1-01').trim();
const DB_CONFIG = {
  host: process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.TEST_DB_USER || process.env.DB_USER,
  password: process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  database: process.env.TEST_DB_NAME || process.env.DB_NAME,
};
const RECOMMENDATIONS = new Map([
  ['', 'KEINE'], ['-', 'KEINE'], ['OHNE', 'KEINE'], ['H', 'HS'], ['R', 'RS'],
  ['H/R', 'HS_RS'], ['R/GY', 'RS_GY'], ['HS', 'HS'], ['RS', 'RS'], ['GY', 'GY'],
  ['KEINE', 'KEINE'], ['HS_RS', 'HS_RS'], ['RS_GY', 'RS_GY'],
]);

let authToken = '';
let firstImportIds = [];
let firstImportResult;

const textOrNull = (value) => String(value ?? '').trim() || null;
const boolNumber = (value) => ['1', 'true', 'ja', 'j', 'yes', 'y'].includes(String(value ?? '').trim().toLowerCase()) ? 1 : 0;
const isLocal = (value) => ['localhost', '127.0.0.1', '::1'].includes(String(value || '').trim().toLowerCase());

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const input = String(value ?? '').trim();
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}` : null;
}

function normalizeRecommendation(value) {
  const input = String(value ?? '').trim().toUpperCase();
  assert.ok(RECOMMENDATIONS.has(input), `Unbekannte Empfehlung in CSV: "${value}"`);
  return RECOMMENDATIONS.get(input);
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ';' && !quoted) {
      values.push(value);
      value = '';
    } else value += character;
  }
  assert.equal(quoted, false, 'Nicht geschlossenes Anfuehrungszeichen in CSV');
  values.push(value);
  return values;
}

async function loadCsv() {
  const input = (await fs.readFile(CSV_FILE, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = input.split('\n').filter((line) => line.trim());
  assert.ok(lines.length > 1, 'CSV enthaelt keine Datensaetze');
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    assert.equal(values.length, headers.length, `CSV-Zeile ${index + 2}: Spaltenanzahl`);
    return {
      row_number: index + 2,
      values,
      record: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])),
    };
  });
  return { headers, rows };
}

function rowLabel(row) {
  return `CSV-Zeile ${row.row_number}: ${row.record.vorname} ${row.record.nachname} (${row.record.geburtsdatum})`;
}

async function openDb() {
  assert.ok(DB_CONFIG.user && DB_CONFIG.database, 'DB_USER/DB_NAME bzw. TEST_DB_USER/TEST_DB_NAME fehlt');
  assert.ok(isLocal(DB_CONFIG.host) || process.env.TEST_ALLOW_REMOTE_DB === '1', `Sicherheitsabbruch: Remote-DB ${DB_CONFIG.host}`);
  return mysql.createConnection(DB_CONFIG);
}

async function requestJson(urlPath, options = {}, authenticated = true) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (authenticated) headers.Authorization = `Bearer ${await getAuthToken()}`;
  const response = await fetch(`${API_BASE}${urlPath}`, { ...options, headers });
  const responseText = await response.text();
  let body;
  try { body = responseText ? JSON.parse(responseText) : {}; } catch { body = { raw: responseText }; }
  assert.ok(response.ok, `HTTP ${response.status} ${urlPath}: ${body.error || body.raw || responseText}`);
  return body;
}

async function getAuthToken() {
  if (authToken) return authToken;
  authToken = String(process.env.TEST_AUTH_TOKEN || '').trim();
  if (authToken) return authToken;
  const username = process.env.TEST_USERNAME || process.env.VITE_DEV_LOGIN_USERNAME;
  const password = process.env.TEST_PASSWORD || process.env.VITE_DEV_LOGIN_PASSWORD;
  assert.ok(username && password, 'TEST_AUTH_TOKEN oder TEST_USERNAME/TEST_PASSWORD fehlt');
  const login = await requestJson('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }, false);
  authToken = String(login.token || '').trim();
  assert.ok(authToken, 'Login lieferte kein Token');
  const permissions = Array.isArray(login.user?.permissions) ? login.user.permissions : [];
  assert.ok(permissions.includes('verfahren.anzeigen'), 'Testbenutzer hat verfahren.anzeigen nicht');
  assert.ok(permissions.includes('verfahren.bearbeiten'), 'Testbenutzer hat verfahren.bearbeiten nicht');
  return authToken;
}

async function tableColumns(db, table) {
  const [rows] = await db.execute(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

async function assertCurrentSchema(db) {
  const expected = {
    anm_schueler: ['id', 'verfahren_id', 'vorname', 'nachname', 'geburtsdatum', 'strasse', 'plz', 'ort', 'foerderbedarf', 'zieldifferent'],
    anm_schueler_runde: ['verfahren_id', 'schueler_id', 'runde_id', 'anmeldestatus', 'schul_nr', 'abgleich_status'],
    anm_schueler_externe_id: ['schueler_id', 'herkunft_art', 'herkunft_snr', 'externe_id'],
    anm_kat_empfehlung: ['id', 'code', 'aktiv'],
    anm_kat_quelle: ['code', 'aktiv'],
  };
  for (const [table, required] of Object.entries(expected)) {
    const columns = await tableColumns(db, table);
    assert.ok(columns.size, `Tabelle ${table} fehlt`);
    for (const field of required) assert.ok(columns.has(field), `DB-Feld ${table}.${field} fehlt`);
  }
  const studentColumns = await tableColumns(db, 'anm_schueler');
  assert.ok(studentColumns.has('empfehlung') || studentColumns.has('empfehlung_id'), 'Empfehlungsfeld fehlt');
  assert.equal(studentColumns.has('externe_id'), false, 'Legacy-Feld anm_schueler.externe_id darf nicht verwendet werden');
  assert.equal(studentColumns.has('externe_schueler_id'), false, 'Legacy-Feld anm_schueler.externe_schueler_id darf nicht verwendet werden');
}

async function assertSafeContext(db) {
  assert.ok(isLocal(new URL(API_BASE).hostname) || process.env.TEST_ALLOW_REMOTE_API === '1', `Sicherheitsabbruch: Remote-API ${API_BASE}`);
  const status = await requestJson('/api/connection/status', {}, false);
  assert.equal(status.configured, true, 'Backend hat keine DB-Verbindung');
  assert.equal(String(status.database), String(DB_CONFIG.database), 'Backend und Test pruefen unterschiedliche Datenbanken');
  assert.equal(Number(status.port), Number(DB_CONFIG.port), 'Backend und Test verwenden unterschiedliche DB-Ports');
  assert.ok(isLocal(status.host) || process.env.TEST_ALLOW_REMOTE_DB === '1', `Backend verwendet Remote-DB ${status.host}`);
  const [contexts] = await db.execute(
    `SELECT v.bezeichnung, v.verfahrenstyp, v.status, r.status AS runde_status
       FROM anm_verfahren v JOIN anm_runde r ON r.verfahren_id = v.id
      WHERE v.id = ? AND r.id = ?`,
    [VERFAHREN_ID, RUNDE_ID],
  );
  assert.equal(contexts.length, 1, `Testkontext Verfahren ${VERFAHREN_ID}/Runde ${RUNDE_ID} fehlt`);
  assert.ok(['GS', 'SEK1'].includes(contexts[0].verfahrenstyp), `Ungeeigneter Verfahrenstyp ${contexts[0].verfahrenstyp}`);
  if (EXPECTED_VERFAHREN_NAME) assert.equal(contexts[0].bezeichnung, EXPECTED_VERFAHREN_NAME, 'Unerwartetes Verfahren; Sicherheitsabbruch');
  assert.notEqual(contexts[0].status, 'Beendet', 'Verfahren ist beendet');
  assert.notEqual(contexts[0].runde_status, 'Beendet', 'Runde ist beendet');
  const [sources] = await db.execute('SELECT code FROM anm_kat_quelle WHERE code = ? AND aktiv = 1', [SOURCE_ART]);
  assert.equal(sources.length, 1, `Quelle ${SOURCE_ART} ist nicht aktiv`);
}

function buildMapping(fields, headers) {
  const headerByKey = new Map(headers.map((header) => [header.trim().toLowerCase(), header]));
  const aliases = { source_school_snr: ['snr', 'herkunftsschule_snr'], externe_schueler_id: ['externe_schueler_id', 'externe_id'] };
  return Object.fromEntries(fields.filter((field) => !field.readOnly).map((field) => {
    const candidates = [field.key, ...(aliases[field.key] || [])];
    return [field.key, candidates.map((key) => headerByKey.get(key.toLowerCase())).find(Boolean) || ''];
  }));
}

async function importPool(csv) {
  const query = new URLSearchParams({ verfahren_id: String(VERFAHREN_ID), runde_id: String(RUNDE_ID), import_art: 'pool' });
  const schema = await requestJson(`/api/importe/anm-schueler/schema?${query}`);
  assert.ok(Array.isArray(schema.fields) && schema.fields.length, 'Importschema enthaelt keine Felder');
  assert.ok(schema.sources?.some((source) => source.code === SOURCE_ART), `Quelle ${SOURCE_ART} fehlt im Importschema`);
  const mapping = buildMapping(schema.fields, csv.headers);
  for (const field of ['source_school_snr', 'vorname', 'nachname', 'geburtsdatum']) assert.ok(mapping[field], `CSV-Mapping fuer ${field} fehlt`);
  const validation = await requestJson('/api/importe/anm-schueler/validate', {
    method: 'POST',
    body: JSON.stringify({
      verfahren_id: VERFAHREN_ID, runde_id: RUNDE_ID, import_art: 'pool', source_art: SOURCE_ART,
      csv_columns: csv.headers, csv_rows: csv.rows, mapping, options: {},
    }),
  });
  const invalid = (validation.rows || []).filter((row) => row.status === 'fehler');
  assert.equal(invalid.length, 0, invalid.map((row) => `CSV-Zeile ${row.row_number}: ${(row.errors || []).join('; ')}`).join('\n'));
  assert.equal(validation.rows?.length, csv.rows.length, 'Vorschau enthaelt nicht alle CSV-Datensaetze');
  assert.ok(validation.validation_token, 'Vorschau lieferte kein validation_token');
  const result = await requestJson('/api/importe/anm-schueler/execute', {
    method: 'POST',
    body: JSON.stringify({
      verfahren_id: VERFAHREN_ID, runde_id: RUNDE_ID, import_art: 'pool', source_art: SOURCE_ART,
      validation_token: validation.validation_token,
      selected_row_numbers: validation.rows.map((row) => Number(row.row_number)),
    }),
  });
  assert.equal(Number(result.errors || 0), 0, (result.row_results || []).filter((row) => row.action === 'FEHLER').map((row) => `CSV-Zeile ${row.row_number}: ${row.message}`).join('\n'));
  assert.equal(Number(result.inserted || 0) + Number(result.updated || 0), csv.rows.length, 'Nicht alle CSV-Datensaetze wurden ausgefuehrt');
  assert.equal(Number(result.skipped || 0), 0, 'CSV-Datensaetze wurden uebersprungen');
  return result;
}

async function loadImportedStudent(db, csvRow) {
  const columns = await tableColumns(db, 'anm_schueler');
  const recommendation = columns.has('empfehlung_id') ? 'e.code AS empfehlung_code' : 's.empfehlung AS empfehlung_code';
  const join = columns.has('empfehlung_id') ? 'LEFT JOIN anm_kat_empfehlung e ON e.id = s.empfehlung_id' : '';
  const [rows] = await db.execute(
    `SELECT s.id, s.verfahren_id, s.vorname, s.nachname, s.geburtsdatum,
            s.strasse, s.plz, s.ort, s.foerderbedarf, s.zieldifferent, s.herkunft,
            s.herkunftsschule_snr, ${recommendation}
       FROM anm_schueler s ${join}
      WHERE s.verfahren_id = ? AND TRIM(s.vorname) = ? AND TRIM(s.nachname) = ? AND s.geburtsdatum = ?`,
    [VERFAHREN_ID, textOrNull(csvRow.record.vorname), textOrNull(csvRow.record.nachname), normalizeDate(csvRow.record.geburtsdatum)],
  );
  return rows;
}

async function verifyCsvRows(db, csv, expectedRoundSchools = new Map()) {
  const ids = [];
  for (const csvRow of csv.rows) {
    const expected = csvRow.record;
    const rows = await loadImportedStudent(db, csvRow);
    assert.equal(rows.length, 1, `${rowLabel(csvRow)}: anm_schueler.id - erwartet 1 Treffer, gefunden ${rows.length}`);
    const actual = rows[0];
    const checks = [
      ['vorname', textOrNull(actual.vorname), textOrNull(expected.vorname)],
      ['nachname', textOrNull(actual.nachname), textOrNull(expected.nachname)],
      ['geburtsdatum', normalizeDate(actual.geburtsdatum), normalizeDate(expected.geburtsdatum)],
      ['strasse', textOrNull(actual.strasse), textOrNull(expected.strasse)],
      ['plz', textOrNull(actual.plz), textOrNull(expected.plz)],
      ['ort', textOrNull(actual.ort), textOrNull(expected.ort)],
      ['foerderbedarf', Number(actual.foerderbedarf || 0), boolNumber(expected.foerderbedarf)],
      ['zieldifferent', Number(actual.zieldifferent || 0), boolNumber(expected.zieldifferent)],
      ['empfehlung', textOrNull(actual.empfehlung_code), normalizeRecommendation(expected.empfehlung)],
      ['herkunftsschule_snr', textOrNull(actual.herkunftsschule_snr), textOrNull(expected.Snr)],
      ['herkunft', textOrNull(actual.herkunft), SOURCE_ART],
    ];
    for (const [field, actualValue, expectedValue] of checks) {
      assert.equal(actualValue, expectedValue, `${rowLabel(csvRow)}: anm_schueler.${field}; erwartet=${expectedValue}, DB=${actualValue}`);
    }
    const [roundRows] = await db.execute(
      `SELECT verfahren_id, schueler_id, runde_id, anmeldestatus, schul_nr, abgleich_status
         FROM anm_schueler_runde WHERE verfahren_id = ? AND schueler_id = ? AND runde_id = ?`,
      [VERFAHREN_ID, actual.id, RUNDE_ID],
    );
    assert.equal(roundRows.length, 1, `${rowLabel(csvRow)}: anm_schueler_runde - erwartet genau 1 Rundenzuordnung`);
    assert.equal(Number(roundRows[0].verfahren_id), VERFAHREN_ID, `${rowLabel(csvRow)}: anm_schueler_runde.verfahren_id`);
    assert.equal(Number(roundRows[0].runde_id), RUNDE_ID, `${rowLabel(csvRow)}: anm_schueler_runde.runde_id`);
    assert.equal(
      textOrNull(roundRows[0].schul_nr),
      textOrNull(expectedRoundSchools.get(Number(actual.id))),
      `${rowLabel(csvRow)}: Pool-Import darf anm_schueler_runde.schul_nr weder belegen noch verändern`,
    );
    assert.ok(['Nur Pool', 'Pool + Anm'].includes(String(roundRows[0].abgleich_status)), `${rowLabel(csvRow)}: anm_schueler_runde.abgleich_status=${roundRows[0].abgleich_status}`);
    ids.push(Number(actual.id));
  }
  assert.equal(new Set(ids).size, csv.rows.length, 'Mehrere CSV-Datensaetze wurden derselben anm_schueler.id zugeordnet');
  return ids;
}

async function verifyExternalIds(db, csv, ids) {
  const header = csv.headers.find((value) => ['externe_schueler_id', 'externe_id'].includes(value.trim().toLowerCase()));
  if (!header) return { supplied: false, checked: 0 };
  const schoolScoped = ['SCHULE', 'KITA', 'SONST'].includes(SOURCE_ART);
  let checked = 0;
  for (let index = 0; index < csv.rows.length; index += 1) {
    const externalId = textOrNull(csv.rows[index].record[header]);
    if (!externalId) continue;
    const [rows] = await db.execute(
      `SELECT schueler_id, herkunft_art, herkunft_snr, externe_id FROM anm_schueler_externe_id
        WHERE schueler_id = ? AND herkunft_art = ? AND externe_id = ?`,
      [ids[index], SOURCE_ART, externalId],
    );
    assert.equal(rows.length, 1, `${rowLabel(csv.rows[index])}: anm_schueler_externe_id.externe_id=${externalId}`);
    assert.equal(textOrNull(rows[0].herkunft_snr), schoolScoped ? textOrNull(csv.rows[index].record.Snr) : null, `${rowLabel(csv.rows[index])}: anm_schueler_externe_id.herkunft_snr`);
    checked += 1;
  }
  return { supplied: true, checked };
}

test('Pooldaten: CSV-Struktur und eindeutige Match-Schluessel', async () => {
  const csv = await loadCsv();
  for (const header of ['vorname', 'nachname', 'geburtsdatum', 'strasse', 'plz', 'ort', 'foerderbedarf', 'zieldifferent', 'empfehlung']) {
    assert.ok(csv.headers.includes(header), `CSV-Spalte ${header} fehlt`);
  }
  const keys = new Set();
  for (const row of csv.rows) {
    assert.ok(textOrNull(row.record.vorname), `${rowLabel(row)}: Vorname fehlt`);
    assert.ok(textOrNull(row.record.nachname), `${rowLabel(row)}: Nachname fehlt`);
    assert.ok(normalizeDate(row.record.geburtsdatum), `${rowLabel(row)}: Geburtsdatum fehlt/ungueltig`);
    const key = `${row.record.vorname.trim()}|${row.record.nachname.trim()}|${normalizeDate(row.record.geburtsdatum)}`;
    assert.equal(keys.has(key), false, `Doppelter CSV-Match-Schluessel ${key}`);
    keys.add(key);
  }
  assert.equal(csv.rows.length, 20, `Erwartet 20 CSV-Datensaetze, gefunden ${csv.rows.length}`);
});

test('Pooldaten: API-, Testkontext- und DB-Schema-Pruefung', async () => {
  const db = await openDb();
  try {
    await assertCurrentSchema(db);
    await assertSafeContext(db);
    const [codes] = await db.execute("SELECT code FROM anm_kat_empfehlung WHERE code IN ('HS','RS','GY','KEINE','HS_RS','RS_GY') AND aktiv = 1");
    assert.equal(codes.length, 6, 'Aktive Zielcodes in anm_kat_empfehlung sind unvollstaendig');
    await getAuthToken();
  } finally { await db.end(); }
});

test('Pooldaten: Erstimport und fachlich richtige DB-Felder', async () => {
  const csv = await loadCsv();
  firstImportResult = await importPool(csv);
  const db = await openDb();
  try {
    firstImportIds = await verifyCsvRows(db, csv);
    await verifyExternalIds(db, csv, firstImportIds);
  } finally { await db.end(); }
});

test('Pooldaten: Empfehlungs-Mapping H -> HS', async () => {
  const csv = await loadCsv();
  const rowsWithH = csv.rows.filter((row) => String(row.record.empfehlung).trim().toUpperCase() === 'H');
  assert.ok(rowsWithH.length, 'CSV enthaelt keinen Datensatz mit Empfehlung H');
  const db = await openDb();
  try {
    for (const row of rowsWithH) {
      const records = await loadImportedStudent(db, row);
      assert.equal(records.length, 1, `${rowLabel(row)}: nicht eindeutig gefunden`);
      assert.equal(records[0].empfehlung_code, 'HS', `${rowLabel(row)}: Empfehlungs-Mapping H -> HS`);
    }
  } finally { await db.end(); }
});

test('Pooldaten: Zweitimport bleibt dublettenfrei und ID-stabil', async () => {
  const csv = await loadCsv();
  assert.equal(firstImportIds.length, csv.rows.length, 'Erstimport-IDs fehlen');
  const expectedRoundSchools = new Map([[firstImportIds[0], textOrNull(csv.rows[0].record.Snr)]]);
  const setupDb = await openDb();
  try {
    await setupDb.execute(
      `UPDATE anm_schueler_runde SET schul_nr = ?
        WHERE verfahren_id = ? AND schueler_id = ? AND runde_id = ?`,
      [expectedRoundSchools.get(firstImportIds[0]), VERFAHREN_ID, firstImportIds[0], RUNDE_ID],
    );
  } finally { await setupDb.end(); }
  await importPool(csv);
  const db = await openDb();
  try {
    const secondImportIds = await verifyCsvRows(db, csv, expectedRoundSchools);
    assert.deepEqual(secondImportIds, firstImportIds, 'Beim Zweitimport wurden andere anm_schueler.id verwendet');
    const external = await verifyExternalIds(db, csv, secondImportIds);
    console.log(`POOL_IMPORT_REPORT csv=${csv.rows.length} first_inserted=${Number(firstImportResult?.inserted || 0)} first_updated=${Number(firstImportResult?.updated || 0)} external_ids=${external.supplied ? external.checked : 'n/a'} second_import_duplicate_free=true H_to_HS=true`);
  } finally { await db.end(); }
});
