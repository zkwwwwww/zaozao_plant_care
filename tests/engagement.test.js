const test = require('node:test');
const assert = require('node:assert/strict');
const engagement = require('../utils/engagement');
const format = require('../utils/format');

const today = format.today();
function plant(id, days) {
  return { id, name: id, status: '健康', purchaseDate: format.addDays(today, days - 5), customWaterInterval: 5, customFertInterval: 365, customRepotInterval: 365, records: [] };
}

test('daily summary includes overdue, today, manual and exactly two upcoming days', () => {
  const bundle = { plants: [plant('late', -8), plant('today', 0), plant('tomorrow', 1), plant('soon', 2), plant('later', 3), Object.assign(plant('dead', -4), { status: '死亡' }), Object.assign(plant('memorial', -3), { memorialized: true }), { id: 'manual', name: 'manual', manualTasks: [{ id: 't', title: '观察', done: false, createdAt: today }] }] };
  const summary = engagement.summaryFor(bundle, today);
  assert.deepEqual(summary.groups.map(group => group.count), [2, 1, 2]);
  assert.equal(summary.pending.length, 3);
});

test('only real care and checked manual tasks complete the daily baseline', () => {
  const p = Object.assign(plant('p', 0), { manualTasks: [{ id: 't', title: '观察', done: false }] });
  const first = engagement.observe(null, { plants: [p, plant('soon', 2)] }, today);
  assert.equal(first.total, 2);
  const done = Object.assign({}, p, { records: [{ type: '浇水', date: today }], manualTasks: [{ id: 't', done: true }] });
  const result = engagement.observe(first.state, { plants: [done, plant('soon', 2)] }, today);
  assert.equal(result.allCompleted, true);
  assert.equal(result.done, 2);
});

test('ignoring, removing or recording in the future cannot trigger completion', () => {
  const p = plant('p', 0);
  const first = engagement.observe(null, { plants: [p] }, today);
  assert.equal(engagement.observe(first.state, { plants: [Object.assign({}, p, { reminderIgnores: { water: today } })] }, today).allCompleted, false);
  assert.equal(engagement.observe(first.state, { plants: [] }, today).allCompleted, false);
  assert.equal(engagement.observe(first.state, { plants: [Object.assign({}, p, { records: [{ type: '浇水', date: format.addDays(today, 1) }] })] }, today).allCompleted, false);
});

test('new day resets shown flags and the task baseline', () => {
  const result = engagement.observe({ day: format.addDays(today, -1), dailyShown: true, completedShown: true, targets: [{ plantId: 'old', type: 'water' }] }, { plants: [] }, today);
  assert.equal(result.state.dailyShown, false);
  assert.equal(result.state.completedShown, false);
  assert.equal(result.total, 0);
  assert.equal(result.allCompleted, false);
});
