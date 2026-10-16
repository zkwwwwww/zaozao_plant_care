const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../utils/format');
const constants = require('../utils/constants');
const expense = require('../utils/expense');
const lineage = require('../utils/lineage');
const reminder = require('../utils/reminder');

test('money always keeps two decimals', () => {
  assert.equal(format.money(12), '12.00');
  assert.equal(format.money('3.5'), '3.50');
  assert.equal(format.money(1.005), '1.01');
  assert.equal(format.money(0.1 + 0.2), '0.30');
  assert.equal(format.money('abc'), '0.00');
});

test('legacy statuses map to the new enum', () => {
  assert.equal(constants.normalizeStatus('生长中'), '健康');
  assert.equal(constants.normalizeStatus('状态一般'), '健康');
  assert.equal(constants.normalizeStatus('需要关注'), '待观察');
  assert.equal(constants.normalizeStatus('生病中'), '病害');
  assert.equal(constants.normalizeStatus('虫害'), '虫害');
  assert.equal(constants.normalizeStatus(''), '健康');
  assert.equal(constants.statusClass('休眠'), 'tag-gray');
  assert.equal(constants.statusClass('死亡'), 'tag-red');
});

test('weeks start on Monday', () => {
  assert.equal(expense.weekStart('2026-10-15'), '2026-10-12');
  assert.equal(expense.weekStart('2026-10-12'), '2026-10-12');
  assert.equal(expense.weekStart('2026-10-18'), '2026-10-12');
  assert.equal(expense.weekStart('2026-01-01'), '2025-12-29');
});

test('buildSeries sums per period with cents precision', () => {
  const rows = [
    { date: '2026-10-15', amount: 0.1, category: '肥料' },
    { date: '2026-10-15', amount: 0.2, category: '药剂' },
    { date: '2026-09-01', amount: 10, category: '肥料' },
    { date: '2025-12-31', amount: 5, category: '其他' }
  ];
  const months = expense.buildSeries(rows, 'month', '2026-10-15', 3);
  assert.deepEqual(months.map(item => item.key), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(months.map(item => item.total), ['0.00', '10.00', '0.30']);
  assert.equal(months[1].percent, 100);
  const years = expense.buildSeries(rows, 'year', '2026-10-15', 2);
  assert.deepEqual(years.map(item => item.total), ['5.00', '10.30']);
  const totals = expense.categoryTotals(rows, constants.EXPENSE_CATEGORIES);
  assert.deepEqual(totals.map(item => item.name), ['肥料', '药剂', '其他']);
});

test('mostExpensive skips memorialized, dead and unpriced plants', () => {
  const best = expense.mostExpensive([
    { id: 'a', price: 99, memorialized: true },
    { id: 'b', price: 50, status: '死亡' },
    { id: 'c', price: '' },
    { id: 'd', price: 20 },
    { id: 'e', price: 20 }
  ]);
  assert.equal(best.id, 'd');
  assert.equal(expense.mostExpensive([{ id: 'x', price: 0 }]), null);
});

test('lineage finds root, flattens generations and blocks cycles', () => {
  const seedlings = [
    { id: 's1', motherType: 'plant', motherId: 'p1', startDate: '2026-01-01' },
    { id: 's2', motherType: 'seedling', motherId: 's1', startDate: '2026-02-01' },
    { id: 's3', motherType: 'plant', motherId: 'p1', startDate: '2026-01-05' },
    { id: 's4', motherType: 'text', motherId: '', startDate: '2026-03-01' }
  ];
  assert.deepEqual(lineage.rootOf({ type: 'seedling', id: 's2' }, seedlings), { type: 'plant', id: 'p1' });
  const rows = lineage.flatten({ type: 'plant', id: 'p1' }, node => ({ name: node.id }), seedlings);
  assert.deepEqual(rows.map(row => row.id + '@' + row.depth), ['p1@0', 's1@1', 's2@2', 's3@1']);
  assert.equal(lineage.wouldCycle('s1', { type: 'seedling', id: 's2' }, seedlings), true);
  assert.equal(lineage.wouldCycle('s1', { type: 'plant', id: 'p1' }, seedlings), false);
  assert.equal(lineage.wouldCycle('s2', { type: 'seedling', id: 's3' }, seedlings), false);
});

test('dead plants produce no tasks and dueTodayGroups only keeps due items', () => {
  const today = format.today();
  const base = { id: 'p', name: '龟背', photos: [], records: [], customWaterInterval: 3, customFertInterval: 30, customRepotInterval: 365 };
  const overdue = Object.assign({}, base, { purchaseDate: format.addDays(today, -5) });
  const dead = Object.assign({}, overdue, { id: 'q', status: '死亡' });
  const fresh = Object.assign({}, base, { id: 'r', purchaseDate: today });
  assert.deepEqual(reminder.plantTasks(dead), []);
  const groups = reminder.dueTodayGroups([overdue, dead, fresh], today);
  assert.deepEqual(groups[0].items.map(item => item.plantId), ['p']);
  assert.equal(groups[1].items.length, 0);
});

test('custom range picks unit by span and only counts in-range rows', () => {
  const rows = [
    { date: '2026-09-30', amount: 1, category: '肥料' },
    { date: '2026-10-01', amount: 2.5, category: '肥料' },
    { date: '2026-10-15', amount: 3, category: '药剂' },
    { date: '2026-10-16', amount: 9, category: '药剂' }
  ];
  const days = expense.rangeSeries(rows, '2026-10-01', '2026-10-15');
  assert.equal(days.unit, 'day');
  assert.equal(days.series.length, 15);
  assert.equal(days.series[0].total, '2.50');
  assert.equal(days.series[14].total, '3.00');
  assert.equal(expense.sum(expense.inRange(rows, '2026-10-01', '2026-10-15')), '5.50');
  const months = expense.rangeSeries(rows, '2026-01-01', '2026-10-15');
  assert.equal(months.unit, 'month');
  assert.deepEqual(months.series.slice(-2).map(item => item.total), ['1.00', '5.50']);
  assert.equal(expense.rangeUnit('2020-01-01', '2026-10-15'), 'year');
  assert.equal(expense.rangeSeries(rows, '2026-10-15', '2026-10-15').series.length, 1);
});
