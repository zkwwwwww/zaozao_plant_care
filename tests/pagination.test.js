const test = require('node:test');
const assert = require('node:assert/strict');
const pagination = require('../utils/pagination');

test('pagination exposes 20 more rows on each page', () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1);

  const first = pagination.slice(rows, 1);
  assert.equal(first.items.length, 20);
  assert.equal(first.pageSize, 20);
  assert.equal(first.total, 45);
  assert.equal(first.hasMore, true);

  const second = pagination.slice(rows, 2);
  assert.equal(second.items.length, 40);
  assert.equal(second.hasMore, true);

  const third = pagination.slice(rows, 3);
  assert.equal(third.items.length, 45);
  assert.equal(third.hasMore, false);
});

test('pagination normalizes invalid pages and non-array input', () => {
  assert.equal(pagination.slice([1, 2], 0).page, 1);
  assert.equal(pagination.slice([1, 2], 'invalid').page, 1);
  assert.deepEqual(pagination.slice(null, 1).items, []);
});
