// Integration checks against migrated DB; all test data is rolled back.
const assert = require('node:assert/strict');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { resolveStudent, attachExternalId, upsertRoundState, updateStudentMaster } = require('../lib/schuelerIdentityService');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

async function main() {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    await c.beginTransaction();
    const [contexts] = await c.query('SELECT verfahren_id, MIN(id) AS runde_id FROM anm_runde GROUP BY verfahren_id ORDER BY verfahren_id LIMIT 2');
    assert.equal(contexts.length, 2, 'Zwei Verfahren mit Runden erforderlich.');
    const [a, b] = contexts;
    const prefix = `VERIFY-${Date.now()}`;
    const rows = Array.from({ length: 20 }, (_, i) => ({
      verfahren_id: a.verfahren_id, herkunft: 'POOL', vorname: `${prefix}-${i}`, nachname: 'Integrationstest', geburtsdatum: '2020-01-01',
      external_identity: { herkunft_art: 'POOL', externe_id: `${prefix}-${i}` },
    }));
    const old = [];
    for (const row of rows.slice(0, 19)) old.push(await resolveStudent(c, row));
    const fresh = [];
    for (const row of rows) fresh.push(await resolveStudent(c, { ...row, verfahren_id: b.verfahren_id }));
    assert.ok(fresh.every(result => result.created));
    assert.equal(new Set(fresh.map(result => result.student.id)).size, 20);
    for (const [index, row] of rows.entries()) {
      const repeated = await resolveStudent(c, { ...row, verfahren_id: b.verfahren_id });
      assert.equal(repeated.created, false);
      assert.equal(repeated.student.id, fresh[index].student.id);
    }
    const own = fresh[0].student.id;
    const other = old[0].student.id;
    await updateStudentMaster(c, own, { vorname: 'Aenderung nur im zweiten Verfahren' });
    const [original] = await c.query('SELECT vorname FROM anm_schueler WHERE id=?', [other]);
    assert.equal(original[0].vorname, rows[0].vorname);
    await upsertRoundState(c, { verfahren_id: b.verfahren_id, schueler_id: own, runde_id: b.runde_id });
    await assert.rejects(upsertRoundState(c, { verfahren_id: b.verfahren_id, schueler_id: other, runde_id: b.runde_id }), { code: 'STUDENT_ROUND_PROCEDURE_MISMATCH' });
    await assert.rejects(upsertRoundState(c, { verfahren_id: b.verfahren_id, schueler_id: own, runde_id: a.runde_id }), { code: 'STUDENT_ROUND_PROCEDURE_MISMATCH' });
    await assert.rejects(c.query('INSERT INTO anm_schueler_runde (verfahren_id,schueler_id,runde_id,abgleich_status) VALUES (?,?,?,?)', [b.verfahren_id, other, b.runde_id, 'Nur Pool']), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(c.query('INSERT INTO anm_schueler_runde (verfahren_id,schueler_id,runde_id,abgleich_status) VALUES (?,?,?,?)', [b.verfahren_id, own, a.runde_id, 'Nur Pool']), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(attachExternalId(c, other, { herkunft_art: 'EWO', externe_id: prefix }, b.verfahren_id), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(attachExternalId(c, fresh[1].student.id, rows[0].external_identity, b.verfahren_id), { code: 'EXTERNAL_ID_CONFLICT' });
    assert.equal(await attachExternalId(c, own, rows[0].external_identity, b.verfahren_id), null);
    console.log('OK: 20 eigene Datensaetze, Wiederholungsimport, isolierte Updates, ID-Konflikte und beide Fremdschluessel. Testdaten werden zurueckgerollt.');
  } finally { await c.rollback(); await c.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
