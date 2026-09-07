// Uses the actual CSV parser and import controller. Default: transaction rollback.
// node scripts/repair-pool-procedure.js <csv> <procedure> <round> <source> [--apply]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const mysql = require('mysql2/promise');
const createController = require('../controllers/importeController');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

async function main() {
  const [file, procedure, round, source] = process.argv.slice(2);
  assert.ok(file && Number(procedure) > 0 && Number(round) > 0 && source, 'CSV, Verfahren, Runde und Quelle angeben.');
  const sourceArt = source.toUpperCase();
  assert.ok(['POOL', 'EWO'].includes(sourceArt), 'Reparatur ist auf zentrale Pool-/EWO-IDs begrenzt.');
  const code = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/csv.ts'), 'utf8'));
  const { parseCsvText } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const parsed = parseCsvText(fs.readFileSync(path.resolve(file), 'utf8'), { delimiter: 'auto', hasHeaders: true, charset: 'utf-8' });
  const mapping = { externe_schueler_id: 'id', vorname: 'vorname', nachname: 'nachname', geburtsdatum: 'geburtsdatum', strasse: 'strasse', plz: 'plz', ort: 'ort' };
  assert.ok(Object.values(mapping).every(column => parsed.columns.includes(column)), 'Erwartete CSV-Spalten fehlen.');
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const context = { verfahren_id: Number(procedure), runde_id: Number(round), source_art: sourceArt, import_art: 'pool' };
  const adapter = { query: c.query.bind(c), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const controller = createController({ getPool: () => ({ query: c.query.bind(c), getConnection: async () => adapter }) });
  async function call(method, body) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
    await controller[method]({ body }, res);
    assert.ok(res.statusCode < 400, res.payload?.error || 'Import fehlgeschlagen');
    return res.payload;
  }
  try {
    await c.beginTransaction();
    const [before] = await c.query('SELECT * FROM anm_schueler WHERE verfahren_id <> ? ORDER BY id', [context.verfahren_id]);
    const [foreign] = await c.query(`SELECT sr.*, x.externe_id FROM anm_schueler_runde sr
      JOIN anm_schueler s ON s.id=sr.schueler_id
      JOIN anm_schueler_externe_id x ON x.schueler_id=s.id AND x.herkunft_art=? AND x.herkunft_snr_norm=''
      WHERE sr.verfahren_id=? AND sr.runde_id=? AND s.verfahren_id<>sr.verfahren_id FOR UPDATE`, [sourceArt, context.verfahren_id, context.runde_id]);
    assert.equal(new Set(foreign.map(row => row.id)).size, foreign.length, 'Mehrdeutige externe IDs: manuelle Pruefung erforderlich.');
    const ids = new Set(parsed.rows.map(row => row.record.id));
    assert.equal(ids.size, parsed.rows.length, 'Doppelte CSV-IDs.');
    assert.ok(foreign.every(row => ids.has(row.externe_id)), 'Fehlzuordnung fehlt in Originaldatei.');
    const [cases] = await c.query(`SELECT COUNT(*) AS n FROM anm_offener_fall f JOIN anm_schueler s ON s.id=f.schueler_id
      WHERE f.verfahren_id=? AND s.verfahren_id<>f.verfahren_id`, [context.verfahren_id]);
    assert.equal(Number(cases[0].n), 0, 'Verfahrensfremde offene Faelle muessen zuerst geprueft werden.');
    const input = { ...context, mapping, csv_rows: parsed.rows.map(row => ({ row_number: row.rowNumber, record: row.record })) };
    const preview = await call('anmSchuelerImportValidate', input);
    assert.ok(preview.rows.every(row => row.status !== 'fehler' && !row.warnings.length), JSON.stringify(preview.rows.filter(row => row.status === 'fehler' || row.warnings.length).map(row => ({ row_number: row.row_number, errors: row.errors, warnings: row.warnings }))));
    const result = await call('anmSchuelerImportExecute', { ...context, validation_token: preview.validation_token, selected_row_numbers: preview.rows.map(row => row.row_number) });
    assert.equal(result.errors, 0, JSON.stringify(result.row_results?.filter(row => row.action === 'FEHLER')));
    for (const old of foreign) {
      const [targets] = await c.query(`SELECT sr.id, sr.schueler_id FROM anm_schueler_runde sr
        JOIN anm_schueler_externe_id x ON x.schueler_id=sr.schueler_id AND x.verfahren_id=sr.verfahren_id
        WHERE sr.verfahren_id=? AND sr.runde_id=? AND x.herkunft_art=? AND x.herkunft_snr_norm='' AND x.externe_id=?`,
      [context.verfahren_id, context.runde_id, sourceArt, old.externe_id]);
      assert.equal(targets.length, 1, 'Zieldatensatz nicht eindeutig.');
      assert.notEqual(targets[0].id, old.id);
      // Preserve the original round row and its statuses; discard only the round row just created above.
      await c.query('DELETE FROM anm_schueler_runde WHERE id=?', [targets[0].id]);
      await c.query('UPDATE anm_schueler_runde SET schueler_id=? WHERE id=?', [targets[0].schueler_id, old.id]);
    }
    const [invalid] = await c.query(`SELECT COUNT(*) AS n FROM anm_schueler_runde sr JOIN anm_schueler s ON s.id=sr.schueler_id
      JOIN anm_runde r ON r.id=sr.runde_id WHERE sr.verfahren_id<>s.verfahren_id OR sr.verfahren_id<>r.verfahren_id`);
    assert.equal(Number(invalid[0].n), 0, 'Weitere inkonsistente Rundenzuordnungen vorhanden.');
    const [after] = await c.query('SELECT * FROM anm_schueler WHERE verfahren_id <> ? ORDER BY id', [context.verfahren_id]);
    assert.deepEqual(after, before, 'Stammdaten anderer Verfahren wurden veraendert.');
    const repeatedPreview = await call('anmSchuelerImportValidate', input);
    assert.ok(repeatedPreview.rows.every(row => row.import_action !== 'NEU' && row.status !== 'fehler'), 'Wiederholungsimport erkennt nicht alle Kinder.');
    const repeated = await call('anmSchuelerImportExecute', { ...context, validation_token: repeatedPreview.validation_token, selected_row_numbers: repeatedPreview.rows.map(row => row.row_number) });
    assert.equal(repeated.inserted, 0);
    assert.equal(repeated.errors, 0);
    assert.equal(repeated.updated, parsed.rows.length);
    if (process.argv.includes('--apply')) await c.commit(); else await c.rollback();
    console.log(JSON.stringify({ applied: process.argv.includes('--apply'), csv_rows: parsed.rows.length, repaired: foreign.length, inserted: result.inserted, updated: result.updated, repeated_inserted: repeated.inserted }));
  } catch (error) { await c.rollback(); throw error; }
  finally { await c.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
