const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, loadPage, fakeWx } = require('./helpers/runtime');
const { completeTasks } = require('../services/batch-care');
const format = require('../utils/format');

function cloudFixture() {
  const plants = new Map();
  const records = new Map();
  const errors = new Set();
  let queue = Promise.resolve();
  const db = {
    serverDate: () => 'now',
    collection: name => ({ doc: id => ({
      get: async () => ({ data: (name === 'plants' ? plants : records).get(id) || null }),
      set: async ({ data }) => { if (errors.has(data.plantId)) throw new Error('network'); records.set(id, structuredClone(data)); },
      update: async ({ data }) => Object.assign(plants.get(id), structuredClone(data))
    }) }),
    runTransaction(callback) { const result = queue.then(() => callback(db)); queue = result.catch(() => {}); return result; }
  };
  const main = loadScript('cloudfunctions/batchCare/index.js', { './runtime': {
    openContext: async () => ({ db, openid: 'owner' }), ensure: async () => {},
    fail: message => ({ ok: false, message }), ok: data => ({ ok: true, ...data }),
    text: (value, limit) => String(value || '').slice(0, limit), day: value => value || ''
  } }).exports.main;
  return { main, plants, records, errors };
}

test('mixed care and manual tasks complete safely and concurrent retries do not duplicate records', async () => {
  const f = cloudFixture();
  f.plants.set('p', { _openid: 'owner', name: '新名称', manualTasks: [{ id: 'a', title: '观察', done: false }, { id: 'b', title: '保留', done: false }] });
  const input = { requestId: 'same', date: '2026-11-04', tasks: [
    { key: 'water', plantId: 'p', type: '浇水' }, { key: 'fert', plantId: 'p', type: '施肥' },
    { key: 'manual', plantId: 'p', type: 'manual', taskId: 'a' }
  ] };
  const results = await Promise.all([f.main(input), f.main(input)]);
  assert.ok(results.every(result => result.saved === 3));
  assert.equal(f.records.size, 2);
  assert.equal(f.plants.get('p').manualTasks[0].done, true);
  assert.equal(f.plants.get('p').manualTasks[1].done, false);
  assert.equal(f.plants.get('p').name, '新名称');
});

test('batch results distinguish failures and unavailable or other-owner plants', async () => {
  const f = cloudFixture();
  f.plants.set('p', { _openid: 'owner' });
  f.plants.set('bad', { _openid: 'owner' });
  f.plants.set('other', { _openid: 'someone' });
  f.plants.set('dead', { _openid: 'owner', status: '死亡' });
  f.errors.add('bad');
  const tasks = ['p', 'bad', 'other', 'dead', 'missing'].map(plantId => ({ key: plantId, plantId, type: '浇水' }));
  const first = await f.main({ tasks, requestId: 'r' });
  assert.equal(first.saved, 1);
  assert.equal(first.failed, 1);
  assert.equal(first.skipped, 3);
  f.errors.clear();
  const second = await f.main({ tasks, requestId: 'r' });
  assert.equal(second.saved, 2);
  assert.equal(f.records.size, 2);
  assert.equal((await f.main({ tasks: Array(101).fill(tasks[0]) })).ok, false);
  assert.equal((await f.main({ tasks: [{ plantId: 'p', type: 'manual' }] })).ok, false);
});

test('client chunks all selected tasks, retains one request ID and reports transport failures', async () => {
  const tasks = Array.from({ length: 235 }, (_, i) => ({ key: 'k' + i, plantId: 'p' + i, type: 'water' }));
  const calls = [];
  const progress = [];
  const result = await completeTasks(tasks, async (name, input) => {
    calls.push(input);
    if (calls.length === 2) throw new Error('网络异常');
    return { results: input.tasks.map(task => ({ key: task.key, status: 'saved' })) };
  }, { requestId: 'r', date: '2026-11-04', onProgress: p => progress.push(p.processed) });
  assert.deepEqual(calls.map(call => call.tasks.length), [100, 100, 35]);
  assert.ok(calls.every(call => call.requestId === 'r' && call.tasks[0].type === '浇水'));
  assert.deepEqual(progress, [100, 200, 235]);
  assert.equal(result.saved, 135);
  assert.equal(result.failed, 100);
  assert.equal(result.message, '网络异常');
});

function pageFixture(count) {
  const today = format.today();
  let bundle = { plants: Array.from({ length: count }, (_, i) => ({ id: 'p' + i, name: '植物' + i, status: '健康', records: [],
    customWaterInterval: 1, purchaseDate: format.addDays(today, -1), reminderAdvanceDays: 0, manualTasks: [{ id: 'm', title: '观察', done: false }] })), envs: [], tags: [] };
  const wx = fakeWx();
  const api = { loadBundle: async () => bundle };
  const notices = { paused: 0, suspend() { this.paused += 1; return () => { this.paused -= 1; }; } };
  const page = loadPage('pages/reminders/reminders.js', { '../../services/account': {}, '../../services/data': api,
    '../../services/notifications': notices }, wx);
  return { page, api, wx, notices, setBundle: next => { bundle = next; } };
}

test('selection and group completion include unrendered pages without duplicating manual time groups', async () => {
  const { page } = pageFixture(130);
  await page.load();
  assert.equal(page.data.carePlants.length, 20);
  page.selectAllCare();
  assert.equal(page.data.selectedCareCount, 130);
  page.toggleBatchSelection();
  page.selectTaskScope({ currentTarget: { dataset: { scope: 'due' } } });
  assert.equal(page.data.selectedTaskCount, 260);
  let selected;
  page.confirmBatchTasks = tasks => { selected = tasks; };
  page.completeTaskGroup({ currentTarget: { dataset: { type: 'water' } } });
  assert.equal(selected.length, 130);
  page.completeTaskGroup({ currentTarget: { dataset: { time: 'today' } } });
  assert.equal(selected.length, 130);
  assert.ok(selected.every(task => task.type === 'water'));
  page.renderTaskPage(20);
  assert.equal(page.data.timeGroups.find(group => group.key === 'manual').items.length, 130);
});

test('partial failures stay selected and page retries reuse the original request ID and date', async () => {
  const f = pageFixture(1);
  await f.page.load();
  const calls = [];
  f.api.completeCareTasks = async (tasks, options) => {
    calls.push(options);
    return { saved: 0, failed: tasks.length, skipped: 0, results: tasks.map(task => ({ key: task.key, status: 'failed' })) };
  };
  const tasks = f.page._allTasks;
  await f.page.runBatchTasks(tasks);
  assert.equal(f.page.data.selectedTaskCount, tasks.length);
  assert.equal(f.page.data.batchSelecting, true);
  await f.page.runBatchTasks(tasks);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(calls[0].date, calls[1].date);
});

test('completion notices wait until the batch result is dismissed and stale lists cannot be resubmitted', async () => {
  const f = pageFixture(1);
  await f.page.load();
  let dismiss;
  let calls = 0;
  f.wx.showModal = options => { dismiss = options.success; };
  f.api.completeCareTasks = async tasks => {
    calls += 1;
    return { saved: tasks.length, failed: 0, skipped: 0, results: tasks.map(task => ({ key: task.key, status: 'saved' })) };
  };
  const pending = f.page.runBatchTasks(f.page._allTasks);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.notices.paused, 1);
  assert.equal(f.page.data.busy, true);
  dismiss({ confirm: true });
  await pending;
  assert.equal(f.notices.paused, 0);
  f.page.data.loadError = '读取失败';
  await f.page.runBatchTasks(f.page._allTasks);
  assert.equal(calls, 1);
});
