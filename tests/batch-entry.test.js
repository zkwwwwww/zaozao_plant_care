const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, fakeWx } = require('./helpers/runtime');

function fixture(savePlant) {
  const wx = fakeWx();
  const page = loadPage('pages/batch-entry/batch-entry.js', {
    '../../services/account': { requireLogin: () => true, getSession: () => ({ openid: 'owner' }) },
    '../../services/data': { loadBundle: async () => ({ envs: [], tags: [] }), savePlant }
  }, wx);
  return { page, wx };
}

test('partial batch retry skips successful rows and retains the failed row clientId', async () => {
  const calls = [];
  let fail = true;
  const f = fixture(async input => {
    calls.push(input);
    if (calls.length === 2 && fail) throw new Error('offline');
    return { id: input.clientId, photos: [] };
  });
  await f.page.onLoad();
  f.page.setData({ count: '2', baseName: 'A' }); f.page.rebuildVariety();
  const keys = f.page.data.items.map(item => item.key);
  await f.page.submit();
  assert.equal(f.page.data.savedCount, 1);
  assert.equal(f.page.data.submitting, false);
  assert.equal(f.wx.getStorageSync('batchDraft:owner').modeItems.variety[0].savedId, keys[0]);
  fail = false;
  await f.page.submit();
  assert.deepEqual(calls.map(call => call.clientId), [keys[0], keys[1], keys[1]]);
  assert.equal(f.wx.getStorageSync('batchDraft:owner'), undefined);
});

test('switching modes and rebuilding keep edited names, photos and stable identities', async () => {
  const f = fixture(async () => ({}));
  await f.page.onLoad();
  const first = f.page.data.items[0];
  first.name = '独立名字'; first.photo = 'saved-photo';
  f.page.setData({ baseName: '新前缀', count: '4' }); f.page.rebuildVariety();
  assert.equal(f.page.data.items[0].key, first.key);
  assert.equal(f.page.data.items[0].name, '独立名字');
  assert.equal(f.page.data.items[0].photo, 'saved-photo');
  f.page.switchMode({ currentTarget: { dataset: { mode: 'photos' } } });
  f.page.switchMode({ currentTarget: { dataset: { mode: 'variety' } } });
  assert.equal(f.page.data.items.length, 4);
  assert.equal(f.page.data.items[0].photo, 'saved-photo');
});

test('persisted draft restores the form and unsaved photos on returning', async () => {
  const f = fixture(async () => ({}));
  await f.page.onLoad();
  f.page.setData({ baseName: '恢复草稿' });
  f.page.data.items[0].photo = 'saved-photo';
  f.page.onHide();
  const restored = fixture(async () => ({}));
  restored.wx.setStorageSync('batchDraft:owner', f.wx.getStorageSync('batchDraft:owner'));
  await restored.page.onLoad();
  assert.equal(restored.page.data.baseName, '恢复草稿');
  assert.equal(restored.page.data.items[0].photo, 'saved-photo');
});
