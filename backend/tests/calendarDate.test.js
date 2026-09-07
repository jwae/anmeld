const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCalendarDate } = require('../lib/calendarDate');
const { normalizeDate } = require('../lib/schuelerIdentityService');

test('Deutsche Datumsangaben mit oder ohne fuehrende Nullen ergeben dieselbe Identitaet', () => {
  for (const input of ['6.03.2011', '06.03.2011', '6.3.2011', '06.3.2011', '2011-03-06', '2011-03-06T00:00:00.000Z', new Date(2011, 2, 6)]) {
    assert.equal(normalizeCalendarDate(input), '2011-03-06');
    assert.equal(normalizeDate(input), '2011-03-06');
  }
});

test('Kalenderpruefung erkennt ungueltige Tage, Monate und Schaltjahre', () => {
  for (const input of ['31.02.2011', '29.02.2011', '29.02.1900', '31.4.2011', '0.3.2011', '6.13.2011', '2011-02-31', '', null, '2011-03-06muell', new Date(NaN)]) {
    assert.equal(normalizeCalendarDate(input), null);
  }
  assert.equal(normalizeCalendarDate('29.2.2012'), '2012-02-29');
  assert.equal(normalizeCalendarDate('29.2.2000'), '2000-02-29');
});
