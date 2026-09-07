// Calendar dates stay independent of UTC/time-zone conversions.
function normalizeCalendarDate(value) {
  let year, month, day;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    [year, month, day] = [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  } else {
    const text = String(value ?? '').trim();
    const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
    if (german) [day, month, year] = german.slice(1).map(Number);
    else if (iso) [year, month, day] = iso.slice(1, 4).map(Number);
    else return null;
  }
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = { normalizeCalendarDate };
