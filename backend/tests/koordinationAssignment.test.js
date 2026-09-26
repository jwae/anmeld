const test = require('node:test');
const assert = require('node:assert/strict');
const createController = require('../controllers/koordinationController');

async function assign({
  ids = [7],
  existingIds = ids,
  affectedRows = ids.length,
  failure = '',
  roundStatus = 'In Bearbeitung',
  schoolSnr = 'TEST',
} = {}) {
  const events = [];
  const updates = [];
  const connection = {
    async query(sql, params) {
      const query = sql.replace(/\s+/g, ' ').trim();
      if (query.startsWith('SELECT id, status FROM anm_verfahren')) return [[{ id: 1, status: 'In Bearbeitung' }]];
      if (query.startsWith('SELECT id, verfahren_id, status FROM anm_runde')) return [[{ id: 2, verfahren_id: 1, status: roundStatus }]];
      if (query.startsWith('SELECT snr, name FROM anm_schulen')) return [[{ snr: schoolSnr, name: 'Testschule' }]];
      if (query.startsWith('SELECT s.id,')) {
        events.push(query.endsWith('FOR UPDATE') ? 'select-locked' : 'select');
        return [existingIds.map(id => ({
          id,
          vorname: 'Test',
          nachname: `Kind${id}`,
          koordinierte_snr: 'ALT',
          anmeldestatus: 'Zugeordnet',
        }))];
      }
      if (query.startsWith('UPDATE anm_schueler_runde')) {
        events.push('update');
        updates.push({ query, params });
        if (failure === 'update') throw new Error('Simulierter Schreibfehler');
        return [{ affectedRows }];
      }
      throw new Error(`Unerwartete Abfrage: ${query}`);
    },
    async beginTransaction() { events.push('begin'); },
    async commit() {
      events.push('commit');
      if (failure === 'commit') throw new Error('Simulierter Commitfehler');
    },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
  };
  const pool = { query: connection.query, async getConnection() { return connection; } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; events.push('response'); return this; },
  };
  await createController({ getPool: () => pool }).zuordnen({
    body: { verfahren_id: 1, runde_id: 2, interne_schueler_ids: ids, zugewiesene_schule_snr: schoolSnr },
    user: { username: 'tester' },
  }, res);
  return { res, events, updates };
}

test('Null aktualisierte Zeilen sind ein Fehler, keine erfolgreiche Zuordnung', async () => {
  const { res, events } = await assign({ affectedRows: 0 });
  assert.equal(res.statusCode, 409);
  assert.ok(res.body.error);
  assert.notEqual(res.body.success, true);
  assert.ok(events.indexOf('rollback') < events.indexOf('response'));
  assert.ok(!events.includes('commit'));
  assert.equal(events.at(-1), 'release');
});

test('Teilweise aktualisierte Auswahl wird vollstaendig zurueckgerollt', async () => {
  const { res, events } = await assign({ ids: [7, 8], affectedRows: 1 });
  assert.equal(res.statusCode, 409);
  assert.notEqual(res.body.success, true);
  assert.ok(events.includes('rollback'));
  assert.ok(!events.includes('commit'));
});

test('Fehlender Rundendatensatz stoppt die gesamte Auswahl vor dem UPDATE', async () => {
  const { res, updates, events } = await assign({ ids: [7, 8], existingIds: [7] });
  assert.equal(res.statusCode, 409);
  assert.equal(updates.length, 0);
  assert.ok(events.includes('rollback'));
});

test('Vollstaendige Zuordnung wird erst nach Commit als Erfolg bestaetigt', async () => {
  const { res, events, updates } = await assign({ ids: [7, 8] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.updated_count, 2);
  assert.equal(res.body.requested_count, 2);
  assert.match(res.body.message, /^2 Schueler wurden/);
  assert.deepEqual(events, ['begin', 'select-locked', 'update', 'commit', 'response', 'release']);
  assert.deepEqual(updates[0].params, ['TEST', 'tester', 7, 8, 1, 2]);
  assert.match(updates[0].query, /s\.verfahren_id = \? AND sr\.runde_id = \?/);
});

test('Doppelte Auswahl-IDs werden nur einmal zugeordnet', async () => {
  const { res } = await assign({ ids: [7, 7], existingIds: [7], affectedRows: 1 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.requested_count, 1);
  assert.equal(res.body.updated_count, 1);
  assert.match(res.body.message, /wurde Testschule zugeordnet/);
});

test('Bestehende Zuordnung der aktuellen Runde wird mit der neuen Schulnummer ueberschrieben', async () => {
  const { res, updates } = await assign({ schoolSnr: 'NEU' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].params[0], 'NEU');
  assert.match(updates[0].query, /SET sr\.koordinierte_snr = \?/);
  assert.match(updates[0].query, /s\.id IN \(\?\) AND s\.verfahren_id = \? AND sr\.runde_id = \?/);
  assert.doesNotMatch(updates[0].query, /WHERE .*sr\.koordinierte_snr/i);
  assert.doesNotMatch(updates[0].query, /WHERE .*sr\.anmeldestatus/i);
});

for (const failure of ['update', 'commit']) {
  test(`${failure}-Fehler fuehrt zu Rollback und Fehlermeldung`, async () => {
    const { res, events } = await assign({ failure });
    assert.equal(res.statusCode, 500);
    assert.notEqual(res.body.success, true);
    assert.ok(events.includes('rollback'));
    assert.ok(events.indexOf('rollback') < events.indexOf('response'));
    assert.equal(events.at(-1), 'release');
  });
}

test('Beendete Runde bleibt schreibgeschuetzt', async () => {
  const { res, updates } = await assign({ roundStatus: 'Beendet' });
  assert.equal(res.statusCode, 409);
  assert.equal(updates.length, 0);
});
