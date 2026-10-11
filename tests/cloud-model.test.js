const test = require('node:test');
const assert = require('node:assert/strict');
const cloudModel = require('../utils/cloud-model');

test('同一旧编号只保留第一条，空编号会被丢弃', () => {
  const result = cloudModel.dedupeByClientId([
    { clientId: 'plant_1', name: '绿萝' },
    { clientId: 'plant_1', name: '重复绿萝' },
    { clientId: '', name: '无名' },
    { clientId: 'plant_2', name: '虎皮兰' }
  ]);
  assert.deepEqual(result.map(item => item.name), ['绿萝', '虎皮兰']);
});

test('空列表不会报错', () => {
  assert.deepEqual(cloudModel.dedupeByClientId(null), []);
});
