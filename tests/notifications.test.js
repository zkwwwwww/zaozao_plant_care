const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../utils/format');
const { loadScript, fakeWx } = require('./helpers/runtime');

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const wx = fakeWx();
  let day = format.today();
  let authorized = true;
  let openid = 'alice';
  let bundle = { plants: [] };
  let fail = false;
  const timers = [];
  const release = { current: { version: '1.1.0', date: day, title: '更新', changes: ['更好用'] } };
  const ctx = loadScript('services/notifications.js', {
    './account': { getSession: () => ({ openid }), isAuthorized: () => authorized },
    '../utils/format': Object.assign({}, format, { today: () => day }),
    '../config/releases': release,
    './data': { loadBundle: async () => { if (fail) throw new Error('offline'); return bundle; } }
  }, { wx, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, getApp: () => ({ globalData: { sessionReady: Promise.resolve() } }) });
  const api = ctx.module.exports;
  const rendered = [];
  const host = { render: notice => rendered.push(notice) };
  return { api, wx, host, rendered, release,
    setDay: value => { day = value; }, setBundle: value => { bundle = value; },
    setFail: value => { fail = value; }, setUser: value => { openid = value; authorized = !!value; },
    async flush() { while (timers.length) timers.shift()(); await settle(); }
  };
}

test('release precedes daily popup, and daily popup is shown once per day', async () => {
  const f = fixture();
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1).kind, 'release');
  f.api.close(f.host, false); await settle();
  assert.equal(f.rendered.at(-1).kind, 'clear');
  f.api.close(f.host, false); await settle();
  f.api.hide(f.host); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
  f.setDay(format.addDays(format.today(), 1));
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1).kind, 'clear');
});

test('disabling on the popup persists across releases until explicitly enabled', async () => {
  const f = fixture();
  f.api.show(f.host); await settle();
  f.api.close(f.host, true); await settle();
  assert.equal(f.api.updatesEnabled(), false);
  f.api.close(f.host, false); await settle();
  f.release.current.version = '1.2.0';
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
  f.api.setUpdatesEnabled(true); await f.flush();
  assert.equal(f.rendered.at(-1).kind, 'release');
});

test('completed popup fires once after all observed care is really recorded', async () => {
  const f = fixture();
  const today = format.today();
  const plant = { id: 'p', name: 'P', purchaseDate: format.addDays(today, -5), customWaterInterval: 5, records: [] };
  f.setBundle({ plants: [plant] });
  f.wx.setStorageSync('lastSeenRelease', '1.1.0');
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1).kind, 'daily');
  f.api.close(f.host, false); await settle();
  f.setBundle({ plants: [Object.assign({}, plant, { records: [{ type: '浇水', date: today }] })] });
  f.api.signal(); await f.flush();
  assert.equal(f.rendered.at(-1).kind, 'completed');
  f.api.close(f.host, false); await settle();
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
});

test('failed reads do not consume the daily reminder or emit fake congratulations', async () => {
  const f = fixture();
  f.wx.setStorageSync('lastSeenRelease', '1.1.0');
  f.setFail(true); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
  assert.equal(f.wx.getStorageSync('dailyNotice:alice'), undefined);
  f.setFail(false); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1).kind, 'clear');
});

test('daily state is scoped to the user and guests do not get false empty notices', async () => {
  const f = fixture();
  f.wx.setStorageSync('lastSeenRelease', '1.1.0');
  f.setUser(''); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
  f.setUser('alice'); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1).kind, 'clear');
  f.api.close(f.host, false); await settle();
  f.setUser('bob'); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1).kind, 'clear');
});

test('suspended notices wait for migration and only the foreground host receives them', async () => {
  const f = fixture();
  const resume = f.api.suspend();
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.length, 0);
  f.api.hide(f.host);
  const other = [];
  f.api.show({ render: notice => other.push(notice) });
  resume(); await f.flush();
  assert.equal(other.at(-1).kind, 'release');
  assert.equal(f.rendered.filter(Boolean).length, 0);
});

function currentReleaseFixture(options = {}) {
  const wx = options.wx || fakeWx();
  const release = structuredClone(require('../config/releases'));
  release.current.version = options.currentVersion || '1.2.3';
  if (options.seen !== undefined) wx.setStorageSync('lastSeenRelease', options.seen);
  if (options.enabled !== undefined) wx.setStorageSync('updateNoticesEnabled', options.enabled);
  const timers = new Map();
  let timerId = 0;
  let dataReads = 0;
  const ctx = loadScript('services/notifications.js', {
    './account': { getSession: () => null, isAuthorized: () => false },
    '../config/releases': release,
    './data': { loadBundle: async () => { dataReads += 1; throw new Error('guests must not read private data'); } }
  }, {
    wx,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    getApp: () => ({ globalData: { sessionReady: Promise.resolve() } })
  });
  const rendered = [];
  const host = { render: notice => rendered.push(notice) };
  return {
    api: ctx.module.exports, wx, release, rendered, host,
    dataReads: () => dataReads,
    async flush() {
      while (timers.size) {
        const [id, callback] = timers.entries().next().value;
        timers.delete(id);
        callback();
      }
      await settle();
    }
  };
}

for (const previousVersion of ['1.2.2', '1.1.3']) {
  test('the current release notifies ' + previousVersion + ' users exactly once', async () => {
    const f = currentReleaseFixture({ seen: previousVersion });
    f.api.show(f.host); await settle();
    const notice = f.rendered.at(-1);
    assert.equal(notice.kind, 'release');
    assert.equal(notice.title, f.release.current.title);
    assert.ok(notice.description.includes('1.2.3'));
    assert.ok(notice.description.includes(f.release.current.date));
    assert.deepEqual(notice.changes, f.release.current.changes);
    assert.equal(f.wx.getStorageSync('lastSeenRelease'), '1.2.3');
    f.api.close(f.host, false); await settle();
    f.api.hide(f.host); f.api.show(f.host); await settle();
    assert.equal(f.rendered.at(-1), null);
    assert.equal(f.rendered.filter(notice => notice && notice.kind === 'release').length, 1);
    assert.equal(f.dataReads(), 0);
  });
}

test('an already seen current release stays dismissed after reopening', async () => {
  const f = currentReleaseFixture({ seen: '1.2.3' });
  f.api.show(f.host); await settle();
  f.api.hide(f.host); f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
  assert.equal(f.rendered.filter(notice => notice && notice.kind === 'release').length, 0);
  assert.equal(f.wx.getStorageSync('lastSeenRelease'), '1.2.3');
  assert.equal(f.dataReads(), 0);
});

test('older code does not notify or overwrite a newer seen release', async () => {
  const f = currentReleaseFixture({ seen: '1.2.4' });
  f.api.show(f.host); await settle();
  f.api.signal(); await f.flush();
  assert.equal(f.rendered.at(-1), null);
  assert.equal(f.rendered.filter(notice => notice && notice.kind === 'release').length, 0);
  assert.equal(f.wx.getStorageSync('lastSeenRelease'), '1.2.4');
  assert.equal(f.dataReads(), 0);
});

test('release notifications compare patch numbers numerically across 9 and 10', async () => {
  const next = currentReleaseFixture({ currentVersion: '1.2.10', seen: '1.2.9' });
  next.api.show(next.host); await settle();
  assert.equal(next.rendered.at(-1).kind, 'release');
  assert.equal(next.wx.getStorageSync('lastSeenRelease'), '1.2.10');
  const older = currentReleaseFixture({ currentVersion: '1.2.9', seen: '1.2.10' });
  older.api.show(older.host); await settle();
  assert.equal(older.rendered.at(-1), null);
  assert.equal(older.wx.getStorageSync('lastSeenRelease'), '1.2.10');
});

test('disabling the current popup survives restart and future releases until re-enabled', async () => {
  const first = currentReleaseFixture({ seen: '1.2.2' });
  first.api.show(first.host); await settle();
  assert.equal(first.rendered.at(-1).kind, 'release');
  first.api.close(first.host, true); await settle();
  assert.equal(first.api.updatesEnabled(), false);

  const later = currentReleaseFixture({ wx: first.wx, currentVersion: '1.2.4' });
  later.api.show(later.host); await settle();
  assert.equal(later.rendered.at(-1), null);
  assert.equal(later.wx.getStorageSync('lastSeenRelease'), '1.2.3');
  assert.equal(later.api.updatesEnabled(), false);
  later.api.setUpdatesEnabled(true); await later.flush();
  assert.equal(later.rendered.at(-1).kind, 'release');
  assert.equal(later.wx.getStorageSync('lastSeenRelease'), '1.2.4');
  later.api.close(later.host, false); await settle();
  later.api.hide(later.host); later.api.show(later.host); await settle();
  assert.equal(later.rendered.at(-1), null);
  assert.equal(later.rendered.filter(notice => notice && notice.kind === 'release').length, 1);
  assert.equal(later.dataReads(), 0);
});

test('the saved settings preference prevents the current release until explicitly enabled', async () => {
  const f = currentReleaseFixture({ seen: '1.1.3', enabled: false });
  f.api.show(f.host); await settle();
  assert.equal(f.rendered.at(-1), null);
  assert.equal(f.wx.getStorageSync('lastSeenRelease'), '1.1.3');
  f.api.setUpdatesEnabled(true); await f.flush();
  assert.equal(f.rendered.at(-1).kind, 'release');
  assert.equal(f.wx.getStorageSync('lastSeenRelease'), '1.2.3');
});
