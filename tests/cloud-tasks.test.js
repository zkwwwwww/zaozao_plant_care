const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript } = require('./helpers/runtime');
const format = require('../utils/format');
const reminder = require('../utils/reminder');

function fixture() {
  const documents = new Map();
  let queue = Promise.resolve();
  let nextId = 0;
  const db = {
    createCollection: async () => {},
    serverDate: () => '2026-11-04T00:00:00Z',
    collection: () => ({
      doc: id => ({
        get: async () => ({ data: documents.has(id) ? structuredClone(documents.get(id)) : null }),
        set: async ({ data }) => documents.set(id, Object.assign({ _id: id }, structuredClone(data))),
        update: async ({ data }) => {
          const document = documents.get(id);
          if (!document) throw new Error('missing document');
          Object.entries(data).forEach(([key, value]) => {
            if (key.indexOf('.') >= 0) {
              const [parent, child] = key.split('.');
              document[parent] = Object.assign({}, document[parent], { [child]: value });
            } else document[key] = structuredClone(value);
          });
        }
      }),
      where: conditions => ({ limit: () => ({ get: async () => ({ data: Array.from(documents.values()).filter(doc => Object.entries(conditions).every(([key, value]) => doc[key] === value)) }) }) }),
      add: async ({ data }) => {
        const id = 'new_' + (++nextId);
        documents.set(id, Object.assign({ _id: id }, structuredClone(data)));
        return { _id: id };
      }
    }),
    runTransaction(callback) {
      const result = queue.then(() => callback(db));
      queue = result.catch(() => {});
      return result;
    }
  };
  const runtime = loadScript('cloudfunctions/savePlant/runtime.js', {
    'wx-server-sdk': { init() {}, getWXContext: () => ({ OPENID: 'owner' }), database: () => db }
  }).module.exports;
  const main = loadScript('cloudfunctions/savePlant/index.js', { './runtime': runtime }).exports.main;
  return { main, documents };
}

test('manual mutations preserve profile fields and other concurrently added tasks', async () => {
  const f = fixture();
  f.documents.set('p', { _id: 'p', _openid: 'owner', name: '最新名字', description: '最新备注', photos: ['cloud://photo'], manualTasks: [] });
  const results = await Promise.all([
    f.main({ action: 'addManualTask', id: 'p', taskId: 'a', title: '观察' }),
    f.main({ action: 'addManualTask', id: 'p', taskId: 'b', title: '上柱' })
  ]);
  assert.ok(results.every(result => result.ok));
  const stored = f.documents.get('p');
  assert.equal(stored.name, '最新名字');
  assert.equal(stored.description, '最新备注');
  assert.equal(stored.photos[0], 'cloud://photo');
  assert.deepEqual(stored.manualTasks.map(task => task.id), ['a', 'b']);
  await f.main({ action: 'setManualTask', id: 'p', taskId: 'a', done: true });
  await f.main({ action: 'setManualTask', id: 'p', taskId: 'a', done: true });
  assert.equal(stored.manualTasks[0].done, true);
});

test('manual additions are idempotent and exceeding the limit fails without truncation', async () => {
  const f = fixture();
  f.documents.set('p', { _id: 'p', _openid: 'owner', manualTasks: Array.from({ length: 49 }, (_, i) => ({ id: 't' + i, title: '任务', done: false })) });
  assert.equal((await f.main({ action: 'addManualTask', id: 'p', taskId: 'last', title: '第50条' })).ok, true);
  assert.equal((await f.main({ action: 'addManualTask', id: 'p', taskId: 'last', title: '重试' })).ok, true);
  const response = await f.main({ action: 'addManualTask', id: 'p', taskId: 'extra', title: '第51条' });
  assert.equal(response.ok, false);
  assert.match(response.message, /50/);
  assert.equal(f.documents.get('p').manualTasks.length, 50);
  assert.equal((await f.main({ id: 'p', name: 'P', manualTasks: Array(51).fill({ title: 'T' }) })).ok, false);
});

test('task endpoints reject other owners, missing tasks and unsupported reminder types', async () => {
  const f = fixture();
  f.documents.set('p', { _id: 'p', _openid: 'other', manualTasks: [] });
  assert.equal((await f.main({ action: 'addManualTask', id: 'p', taskId: 'a', title: 'T' })).ok, false);
  f.documents.get('p')._openid = 'owner';
  assert.equal((await f.main({ action: 'setManualTask', id: 'p', taskId: 'missing', done: true })).ok, false);
  assert.equal((await f.main({ action: 'ignoreReminder', id: 'p', type: 'unknown' })).ok, false);
});

test('ignoring only updates the selected reminder field', async () => {
  const f = fixture();
  f.documents.set('p', { _id: 'p', _openid: 'owner', name: 'P', reminderIgnores: { fertilize: '2026-11-01' }, manualTasks: [{ id: 't', title: 'T' }] });
  assert.equal((await f.main({ action: 'ignoreReminder', id: 'p', type: 'water' })).ok, true);
  const plant = f.documents.get('p');
  assert.match(plant.reminderIgnores.water, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(plant.reminderIgnores.fertilize, '2026-11-01');
  assert.equal(plant.manualTasks.length, 1);
});

test('a stable clientId creates one document even after repeated batch requests', async () => {
  const f = fixture();
  const first = await f.main({ clientId: 'batch_same', name: 'A', photos: [] });
  const second = await f.main({ clientId: 'batch_same', name: 'A', photos: [] });
  assert.equal(first.ok, true);
  assert.equal(second.plant.id, first.plant.id);
  assert.equal(f.documents.size, 1);
  f.documents.get(first.plant.id).name = '后来改的名字';
  f.documents.get(first.plant.id).manualTasks = [{ id: 't', title: '后来添加的任务' }];
  await f.main({ clientId: 'batch_same', name: '旧名字', manualTasks: [] });
  assert.equal(f.documents.get(first.plant.id).name, '后来改的名字');
  assert.equal(f.documents.get(first.plant.id).manualTasks.length, 1);
});

test('editing a profile does not serialize stale task and ignore state', () => {
  const api = loadScript('services/data.js', { './account': {} }).module.exports;
  const payload = api.plantPayload({ id: 'p', name: 'P', manualTasks: [{ id: 'stale' }], reminderIgnores: { water: '2026-11-01' } });
  assert.equal(Object.hasOwn(payload, 'manualTasks'), false);
  assert.equal(Object.hasOwn(payload, 'reminderIgnores'), false);
});

test('cloud push uses the same ignore baseline as the client', () => {
  const ctx = loadScript('cloudfunctions/sendDueReminders/index.js', { './runtime': {} });
  const today = format.today();
  const plant = { purchaseDate: format.addDays(today, -4), customWaterInterval: 5, reminderAdvanceDays: 1, reminderIgnores: { water: today }, records: [] };
  assert.equal(ctx.dueTasks(plant, [], today).some(task => task.type === 'water'), false);
  const pushDay = format.addDays(today, 4);
  const task = ctx.dueTasks(plant, [], pushDay).find(item => item.type === 'water');
  assert.equal(task.due, reminder.nextDueDate(plant, 'water'));
});
