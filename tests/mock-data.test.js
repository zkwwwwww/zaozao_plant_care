const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const format = require('../utils/format');
const constants = require('../utils/constants');
const expense = require('../utils/expense');
const lineage = require('../utils/lineage');
const reminder = require('../utils/reminder');
const seed = require('../cloudfunctions/seedMockData/data');

const today = format.today();
const ago = days => format.addDays(today, -days);

// 按写库后的形状还原一份 bundle
const tagIds = Object.fromEntries(seed.tags.map(tag => [tag.key, 'tag-' + tag.key]));
const plants = seed.plants.map(item => ({
  id: item.key,
  name: item.name,
  status: item.status,
  price: item.price,
  photos: item.images,
  tags: item.tags.map(key => tagIds[key]),
  purchaseDate: ago(item.bought),
  companionStart: ago(item.bought),
  customWaterInterval: item.water,
  customFertInterval: item.fert,
  customRepotInterval: item.repot,
  memorialized: !!item.memorial,
  records: item.records.map(r => ({ type: r[0], date: ago(r[1]) }))
}));
const active = plants.filter(p => !p.memorialized);
const seedlings = seed.seedlings.map(item => {
  const mother = item.mother || {};
  return {
    id: item.key,
    method: item.method,
    startDate: ago(item.daysAgo),
    motherType: mother.plant ? 'plant' : mother.seedling ? 'seedling' : mother.text ? 'text' : '',
    motherId: mother.plant || mother.seedling || '',
    motherText: mother.text || ''
  };
});
const expenses = seed.expenses.map(r => ({ date: ago(r[0]), category: r[1], amount: r[2] }));

test('mock plants are unique and cover every status and memorial type', () => {
  assert.ok(plants.length >= 20);
  assert.equal(new Set(plants.map(p => p.name)).size, plants.length);
  assert.equal(new Set(plants.map(p => p.id)).size, plants.length);
  constants.STATUS_OPTIONS.forEach(status => assert.ok(plants.some(p => p.status === status), status));
  const types = seed.plants.filter(p => p.memorial).map(p => p.memorial.type).sort();
  assert.deepEqual(types, ['去世', '送人']);
  plants.forEach(p => assert.equal(constants.normalizeStatus(p.status), p.status));
});

test('mock plants produce overdue, today and upcoming tasks; dead ones produce none', () => {
  const groups = reminder.dueTodayGroups(active, today);
  const [water, fert, repot] = groups;
  assert.ok(water.items.some(t => t.overdue), 'overdue water');
  assert.ok(water.items.some(t => t.due === today), 'water due today');
  assert.ok(fert.items.some(t => t.due === today), 'fertilize due today');
  assert.ok(fert.items.some(t => t.overdue), 'fertilize overdue');
  assert.ok(repot.items.some(t => t.overdue), 'repot overdue');
  const upcoming = active.flatMap(p => reminder.plantTasks(p)).filter(t => t.due > today);
  assert.ok(upcoming.length > 0, 'upcoming in 14 days');
  const dead = active.filter(p => p.status === '死亡');
  assert.ok(dead.length > 0);
  dead.forEach(p => assert.deepEqual(reminder.plantTasks(p), []));
  groups.forEach(g => g.items.forEach(t => assert.notEqual(t.plantId, 'mint')));
});

test('mock tags cover filter cases', () => {
  seed.tags.forEach(tag => assert.ok(active.some(p => p.tags.includes(tagIds[tag.key])), tag.name + ' used'));
  assert.ok(active.some(p => !p.tags.length), 'has 未分类');
  assert.ok(active.some(p => p.tags.length > 1), 'has multi-tag plant');
  seed.plants.forEach(p => assert.ok(seed.envs.some(env => env.key === p.env), p.name + ' env'));
});

test('mock prices cover empty price, decimals and exclusions for most expensive', () => {
  assert.ok(plants.some(p => p.price === ''));
  assert.ok(plants.some(p => String(p.price).includes('.')));
  const top = expense.mostExpensive(plants);
  assert.equal(top.name, '鹿角蕨');
  const overall = plants.filter(p => Number(p.price) > 0).sort((a, b) => b.price - a.price)[0];
  assert.notEqual(overall.id, top.id, 'a memorialized plant is pricier but excluded');
});

test('mock seedlings cover all methods, mother kinds and a 4-generation lineage', () => {
  constants.PROPAGATION_METHODS.forEach(method => assert.ok(seedlings.some(s => s.method === method), method));
  assert.ok(seedlings.some(s => s.motherType === 'plant'));
  assert.ok(seedlings.some(s => s.motherType === 'seedling'));
  assert.ok(seed.seedlings.some(s => s.mother && s.mother.text && s.mother.image), 'text mother with photo');
  assert.ok(seed.seedlings.some(s => s.mother && s.mother.text && !s.mother.image), 'text mother without photo');
  assert.ok(seedlings.some(s => !s.motherType), 'no mother');
  seed.seedlings.forEach((s, index) => {
    if (s.mother && s.mother.seedling) {
      assert.ok(seed.seedlings.findIndex(x => x.key === s.mother.seedling) < index, 'mother seedling defined first');
    }
    if (s.mother && s.mother.plant) assert.ok(plants.some(p => p.id === s.mother.plant));
  });
  const rows = lineage.flatten({ type: 'plant', id: 'monstera' }, node => ({ name: node.id }), seedlings);
  assert.equal(Math.max(...rows.map(r => r.depth)) + 1, 4);
  assert.equal(rows[0].childCount, 2);
  assert.deepEqual(lineage.rootOf({ type: 'seedling', id: 's-monstera-3' }, seedlings), { type: 'plant', id: 'monstera' });
});

test('mock expenses fill every chart mode and category', () => {
  constants.EXPENSE_CATEGORIES.forEach(cat => assert.ok(expenses.some(e => e.category === cat), cat));
  expense.MODES.forEach(mode => {
    const series = expense.buildSeries(expenses, mode.key, today);
    assert.ok(series.filter(item => item.total !== '0.00').length >= 2, mode.key + ' has bars');
  });
  assert.equal(expense.sum(expense.inPeriod(expenses, 'day', today)), '0.30');
  assert.equal(expense.rangeSeries(expenses, ago(30), today).unit, 'day');
  assert.equal(expense.rangeSeries(expenses, ago(900), today).unit, 'year');
});

test('every referenced mock image exists', () => {
  const dir = path.join(__dirname, '../cloudfunctions/seedMockData/images');
  const keys = new Set();
  seed.plants.forEach(p => p.images.forEach(k => keys.add(k)));
  seed.seedlings.forEach(s => {
    s.images.forEach(k => keys.add(k));
    if (s.mother && s.mother.image) keys.add(s.mother.image);
  });
  keys.forEach(key => assert.ok(fs.existsSync(path.join(dir, key + '.jpg')), key));
});
