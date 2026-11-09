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
