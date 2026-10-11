const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../utils/format');

test('addDays handles month end and leap year', () => {
  assert.equal(format.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(format.addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(format.addDays('2025-01-31', 1), '2025-02-01');
});

test('invalid calendar dates do not silently roll over', () => {
  assert.equal(format.toDate('2025-02-30'), null);
  assert.equal(format.fmtDate('not-a-date'), '');
  assert.equal(format.addDays('', 2), '');
});

test('diffDays uses calendar days', () => {
  assert.equal(format.diffDays('2025-12-31', '2026-01-01'), 1);
  assert.equal(format.diffDays('2026-01-01', '2025-12-31'), -1);
});

test('dueInfo distinguishes future, today and overdue dates', () => {
  const today = format.today();
  assert.deepEqual(format.dueInfo(today), {
    text: '今天到期',
    cls: 'tag-amber',
    overdue: false
  });
  assert.equal(format.dueInfo(format.addDays(today, 2)).text, '还有 2 天');
  assert.equal(format.dueInfo(format.addDays(today, -3)).text, '逾期 3 天');
});
