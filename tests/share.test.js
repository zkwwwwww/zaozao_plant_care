const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadScript, loadPage, fakeWx } = require('./helpers/runtime');

test('share callbacks retain page lifecycle and send friends to the public app introduction', () => {
  let page;
  const menus = [];
  const ctx = loadScript('services/page.js', {}, {
    Page: definition => { page = definition; },
    wx: { showShareMenu: options => menus.push(options.menus) }
  });
  let loaded = false;
  let shown = false;
  ctx.module.exports({ onLoad(options) { loaded = options.ok; }, onShow() { shown = true; }, onShareTimeline: () => ({ query: '' }) });
  page.route = 'pages/index/index';
  page.onLoad({ ok: true });
  assert.equal(loaded, true);
  assert.deepEqual(Array.from(menus[0]), ['shareAppMessage', 'shareTimeline']);
  assert.equal(page.onShareAppMessage().path, '/pages/share/share');
  page.onShow();
  assert.equal(shown, true);
  ctx.module.exports({});
  page.onLoad({ ok: true });
  assert.deepEqual(Array.from(menus[2]), ['shareAppMessage']);
  assert.equal(page.onShareAppMessage().path, '/pages/share/share');
});

test('unsupported timeline menus fall back to friend sharing without breaking lifecycle', () => {
  let page;
  const menus = [];
  const ctx = loadScript('services/page.js', {}, { Page: definition => { page = definition; }, wx: {
    showShareMenu(options) { menus.push(options.menus); if (options.menus.length > 1) options.fail(); }
  } });
  let loaded = false;
  ctx.module.exports({ onLoad() { loaded = true; }, onShareTimeline() {} });
  page.onLoad({});
  assert.equal(loaded, true);
  assert.deepEqual(Array.from(menus[1]), ['shareAppMessage']);
});

test('the public introduction supports timeline single-page mode without private data calls', () => {
  const wx = fakeWx();
  wx.getLaunchOptionsSync = () => ({ scene: 1154 });
  const page = loadPage('pages/share/share.js', {}, wx);
  page.onLoad();
  assert.equal(page.data.singlePage, true);
  assert.equal(page.onShareTimeline().query, '');
  let app;
  const ctx = loadScript('app.js', {
    './services/account': { syncTabBar() { throw new Error('No account access in single-page mode'); } },
    './services/notifications': { signal() { throw new Error('No notifications in single-page mode'); } }
  }, { App: definition => { app = definition; } });
  assert.ok(ctx);
  app.onLaunch({ scene: 1154 });
  app.onShow();
  assert.equal(app.globalData.cloudReady, false);
});

test('every registered page has a notification host and share wiring', () => {
  const root = path.resolve(__dirname, '..');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.ok(app.usingComponents['notice-center']);
  app.pages.forEach(route => {
    assert.match(fs.readFileSync(path.join(root, route + '.wxml'), 'utf8'), /<notice-center\b/);
    assert.match(fs.readFileSync(path.join(root, route + '.js'), 'utf8'), /definePage\(/);
  });
});

test('release history uses unique versions and the latest release matches the package version', () => {
  const release = require('../config/releases');
  const pkg = require('../package.json');
  assert.equal(release.current.version, pkg.version);
  assert.equal(new Set(release.releases.map(item => item.version)).size, release.releases.length);
  release.releases.forEach(item => {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.changes.length > 0);
  });
});
