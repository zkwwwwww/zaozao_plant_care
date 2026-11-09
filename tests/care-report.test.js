const test = require('node:test');
const assert = require('node:assert/strict');
const report = require('../utils/care-report');

test('report counts same-named plants independently and keeps historical care', () => {
  const records = count => Array.from({ length: count }, () => ({ date: '2026-11-04', type: '浇水' }));
  const metrics = report.metricsFor({
    plants: [
      { id: 'a', name: '绿萝', records: records(2) },
      { id: 'b', name: '绿萝', records: records(2) },
      { id: 'c', name: '蕨', records: records(3) },
      { id: 'd', name: '告别植物', memorialized: true, records: records(1) }
    ], expenses: [], seedlings: []
  }, 'month', '2026-11-04');
  assert.equal(metrics.find(item => item.label === '期间养护最多').value, '蕨');
  assert.equal(metrics.find(item => item.label === '期间养护次数').value, 8);
  assert.equal(metrics.find(item => item.label === '当前在养').value, 3);
  assert.equal(metrics.some(item => /开花|结果/.test(item.label)), false);
});

test('period metrics exclude future dates and seedlings use the selected period', () => {
  const bundle = { plants: [{ id: 'a', name: 'A', purchaseDate: '2026-11-05', records: [{ date: '2026-11-05' }] }], seedlings: [{ startDate: '2026-10-01' }, { startDate: '2026-11-01' }], expenses: [{ date: '2026-11-03', amount: 1 }, { date: '2026-11-05', amount: 10 }] };
  const month = report.metricsFor(bundle, 'month', '2026-11-04');
  assert.equal(month.find(item => item.label === '期间新建育苗').value, 1);
  assert.equal(month.find(item => item.label === '期间其他花费').value, '¥1.00');
  assert.equal(month.find(item => item.label === '期间购入植物').value, 0);
  assert.equal(report.metricsFor(bundle, 'year', '2026-11-04').find(item => item.label === '期间新建育苗').value, 2);
});
