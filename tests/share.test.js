const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadScript, fakeWx } = require('./helpers/runtime');

const root = path.resolve(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const guardedLifecycles = [
  'onReady', 'onHide', 'onUnload', 'onPullDownRefresh', 'onReachBottom',
  'onPageScroll', 'onResize', 'onTabItemTap', 'onSaveExitState'
];

function mountPage(definition) {
  const page = Object.assign({}, definition);
  page.data = structuredClone(definition.data || {});
  page.setData = partial => Object.assign(page.data, structuredClone(partial));
  return page;
}

function shareRuntime(wx, globals = {}) {
  let page;
  const ctx = loadScript('services/page.js', {}, Object.assign({
    Page: definition => { page = mountPage(definition); },
    wx
  }, globals));
  return {
    define(definition) {
      ctx.module.exports(definition);
      return page;
    },
    load(file, mocks = {}) {
      loadScript(file, Object.assign({}, mocks, {
        '../../services/page': ctx.module.exports
      }), { wx, setTimeout() {} });
      page.route = file.slice(0, -3);
      return page;
    }
  };
}

function singlePageWx(scene = 1154) {
  const wx = fakeWx();
  wx.getLaunchOptionsSync = () => ({ scene });
  wx.getStorageSync = () => { throw new Error('No private storage reads in share preview'); };
  wx.setStorageSync = () => { throw new Error('No private draft writes in share preview'); };
  wx.cloud = {
    callFunction() { throw new Error('No cloud calls in share preview'); },
    database() { throw new Error('No database access in share preview'); }
  };
  return wx;
}

test('native share menus and ordinary page lifecycles work without page-specific share callbacks', () => {
  const menus = [];
  const wx = fakeWx();
  wx.showShareMenu = options => menus.push(Array.from(options.menus));
  const events = [];
  const definition = {
    data: { retained: 'page data' },
    onLoad(options) { events.push(['load', this, options]); return 'loaded'; },
    onShow() { events.push(['show', this]); return 'shown'; }
  };
  guardedLifecycles.forEach(name => {
    definition[name] = function (event) {
      events.push([name, this, event]);
      return name;
    };
  });
  const page = shareRuntime(wx).define(definition);
  const options = { id: 'private-plant', ok: true };
  assert.equal(page.onLoad(options), 'loaded');
  assert.equal(page.onShow(), 'shown');
  guardedLifecycles.forEach(name => {
    const event = { source: name };
    assert.equal(page[name](event), name);
    assert.equal(events.at(-1)[1], page);
    assert.equal(events.at(-1)[2], event);
  });
  assert.equal(events[0][1], page);
  assert.equal(events[0][2], options);
  assert.equal(events[1][1], page);
  assert.deepEqual(menus, [
    ['shareAppMessage', 'shareTimeline'],
    ['shareAppMessage', 'shareTimeline']
  ]);
  assert.equal(page.data.retained, 'page data');
  assert.equal(page.data.appSharePreview, false);
  assert.equal(page.data.appShareSinglePage, false);
  assert.deepEqual(definition.data, { retained: 'page data' });
});

test('friend and timeline payloads share the application rather than private page parameters', () => {
  const wx = fakeWx();
  const page = shareRuntime(wx).define({
    data: { id: 'private-plant', name: 'Private name', price: 99 },
    onShareAppMessage() { return { path: '/private?id=private-plant' }; },
    onShareTimeline() { return { query: 'id=private-plant&price=99' }; }
  });
  page.route = 'pages/plant-detail/plant-detail';
  const message = page.onShareAppMessage({ from: 'menu' });
  const timeline = page.onShareTimeline();
  assert.equal(message.path, '/pages/share/share');
  assert.equal(message.imageUrl, '/assets/icons/logo.png');
  assert.equal(timeline.query, 'appShare=1');
  assert.equal(timeline.imageUrl, message.imageUrl);
  assert.equal(timeline.title, message.title);
  assert.equal(Object.hasOwn(timeline, 'path'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(page.onShareAppMessage({ from: 'button' }))), JSON.parse(JSON.stringify(message)));
  assert.doesNotMatch(JSON.stringify([message, timeline]), /private-plant|Private name|price|99/);
});

test('every registered page enables both native menus and provides a safe full-mode timeline landing', () => {
  appConfig.pages.forEach(route => {
    const menus = [];
    const wx = singlePageWx(1001);
    wx.showShareMenu = options => menus.push(Array.from(options.menus));
    const page = shareRuntime(wx).load(route + '.js');
    page.onLoad({ appShare: '1', id: 'private-plant', price: '99' });
    page.onShow();
    assert.equal(page.data.appSharePreview, true, route);
    assert.equal(page.data.appShareSinglePage, false, route);
    assert.equal(typeof page.onShareTimeline, 'function', route);
    assert.equal(page.onShareTimeline().query, 'appShare=1', route);
    assert.equal(page.onShareAppMessage().path, '/pages/share/share', route);
    assert.deepEqual(menus, [
      ['shareAppMessage', 'shareTimeline'],
      ['shareAppMessage', 'shareTimeline']
    ], route);
    if (page.onHide) page.onHide();
    if (page.onUnload) page.onUnload();
  });
});

test('timeline single-page mode skips private page reads, lifecycle work and draft writes', () => {
  const definition = {
    data: { retained: 'unchanged' },
    onLoad() { throw new Error('No private page initialization'); },
    onShow() { throw new Error('No private page refresh'); }
  };
  guardedLifecycles.forEach(name => {
    definition[name] = () => { throw new Error('No private lifecycle: ' + name); };
  });
  const page = shareRuntime(singlePageWx()).define(definition);
  page.onLoad({ id: 'private-plant' });
  page.onShow();
  guardedLifecycles.forEach(name => page[name]({ from: 'preview' }));
  assert.equal(page.data.appSharePreview, true);
  assert.equal(page.data.appShareSinglePage, true);
  assert.equal(page.data.retained, 'unchanged');
});

test('single-page and marked full entries hide private content before onLoad or draft lifecycles', () => {
  [
    { entry: { scene: 1154 }, singlePage: true },
    { entry: { scene: 1001, query: { appShare: '1' } }, singlePage: false }
  ].forEach(({ entry, singlePage }) => {
    const wx = singlePageWx();
    wx.getEnterOptionsSync = () => entry;
    const page = shareRuntime(wx).define({
      data: { retained: 'unchanged' },
      onShow() { throw new Error('No private refresh before onLoad'); },
      onHide() { throw new Error('No private draft writes before onLoad'); },
      onUnload() { throw new Error('No private draft writes before onLoad'); }
    });
    assert.equal(page.data.appSharePreview, true);
    assert.equal(page.data.appShareSinglePage, singlePage);
    assert.equal(page.data.retained, 'unchanged');
    assert.doesNotThrow(() => page.onShow());
    assert.doesNotThrow(() => page.onHide());
    assert.doesNotThrow(() => page.onUnload());
  });
});

test('ordinary page options clear a stale entry share marker and restore normal lifecycle', () => {
  const wx = fakeWx();
  wx.getEnterOptionsSync = () => ({ scene: 1001, query: { appShare: '1' } });
  const events = [];
  const page = shareRuntime(wx).define({
    onLoad(options) { events.push(['load', options]); },
    onShow() { events.push(['show']); },
    onHide() { events.push(['hide']); },
    onUnload() { events.push(['unload']); }
  });
  assert.equal(page.data.appSharePreview, true);
  page.onShow();
  page.onHide();
  page.onUnload();
  assert.equal(events.length, 0);
  const options = {};
  page.onLoad(options);
  page.onShow();
  page.onHide();
  page.onUnload();
  assert.equal(page.data.appSharePreview, false);
  assert.equal(page.data.appShareSinglePage, false);
  assert.deepEqual(events, [['load', options], ['show'], ['hide'], ['unload']]);
});

test('all real pages skip their account, data and draft lifecycles in timeline single-page mode', () => {
  appConfig.pages.forEach(route => {
    const page = shareRuntime(singlePageWx()).load(route + '.js');
    assert.equal(page.data.appSharePreview, true, route);
    assert.equal(page.data.appShareSinglePage, true, route);
    if (page.onHide) page.onHide();
    if (page.onUnload) page.onUnload();
    page.onLoad({ id: 'private-plant' });
    page.onShow();
    if (page.onReady) page.onReady();
    if (page.onHide) page.onHide();
    if (page.onUnload) page.onUnload();
    assert.equal(page.data.appSharePreview, true, route);
    assert.equal(page.data.appShareSinglePage, true, route);
  });
});

test('the latest entry scene takes precedence over an old single-page launch scene', () => {
  const wx = fakeWx();
  wx.getLaunchOptionsSync = () => ({ scene: 1154 });
  wx.getEnterOptionsSync = () => ({ scene: 1001 });
  let loaded = false;
  const page = shareRuntime(wx).define({ onLoad() { loaded = true; } });
  page.onLoad({});
  assert.equal(loaded, true);
  assert.equal(page.data.appSharePreview, false);
  assert.equal(page.data.appShareSinglePage, false);
});

test('single-page detection falls back to launch options when entry options are unavailable', () => {
  const wx = singlePageWx();
  wx.getEnterOptionsSync = () => { throw new Error('Unsupported entry options'); };
  const page = shareRuntime(wx).define({ onLoad() { throw new Error('No private page initialization'); } });
  page.onLoad({});
  assert.equal(page.data.appSharePreview, true);
  assert.equal(page.data.appShareSinglePage, true);
});

test('entry option providers retain their wx receiver during initial and lifecycle detection', () => {
  ['getEnterOptionsSync', 'getLaunchOptionsSync'].forEach(provider => {
    const wx = fakeWx();
    const receivers = [];
    wx[provider] = function () {
      receivers.push(this);
      return { scene: 1154 };
    };
    const page = shareRuntime(wx).define({});
    assert.equal(page.data.appSharePreview, true, provider);
    page.onLoad({});
    page.onShow();
    assert.equal(page.data.appShareSinglePage, true, provider);
    assert.ok(receivers.length >= 3, provider);
    receivers.forEach(receiver => assert.equal(receiver, wx, provider));
  });
});

test('a preview becomes navigable after full entry without resuming private page lifecycle', () => {
  let scene = 1154;
  const wx = singlePageWx();
  wx.getEnterOptionsSync = () => ({ scene });
  const page = shareRuntime(wx).define({
    onLoad() { throw new Error('No private page initialization'); },
    onShow() { throw new Error('No private page refresh'); },
    onUnload() { throw new Error('No private draft writes'); }
  });
  page.onLoad({ appShare: '1' });
  page.onShow();
  assert.equal(page.data.appShareSinglePage, true);
  scene = 1001;
  page.onShow();
  page.onUnload();
  assert.equal(page.data.appSharePreview, true);
  assert.equal(page.data.appShareSinglePage, false);
});

test('a reused normal page hides private content when the latest entry becomes single-page', () => {
  let scene = 1001;
  const wx = fakeWx();
  wx.getEnterOptionsSync = () => ({ scene });
  let refreshes = 0;
  const page = shareRuntime(wx).define({ onShow() { refreshes += 1; } });
  page.onLoad({});
  page.onShow();
  assert.equal(refreshes, 1);
  scene = 1154;
  page.onShow();
  assert.equal(refreshes, 1);
  assert.equal(page.data.appSharePreview, true);
  assert.equal(page.data.appShareSinglePage, true);
});

test('unsupported timeline menus fall back asynchronously without breaking ordinary lifecycle', () => {
  const attempts = [];
  const wx = fakeWx();
  wx.showShareMenu = options => {
    attempts.push(options);
    if (options.menus.length === 1) throw new Error('Friend menu is also unavailable');
  };
  let loaded = false;
  const page = shareRuntime(wx).define({ onLoad() { loaded = true; } });
  page.onLoad({});
  assert.equal(loaded, true);
  assert.doesNotThrow(() => attempts[0].fail({ errMsg: 'Unsupported timeline menu' }));
  assert.deepEqual(Array.from(attempts[1].menus), ['shareAppMessage']);
});

test('clients with throwing or missing share APIs still run ordinary page lifecycle', () => {
  [
    { showShareMenu() { throw new Error('Unsupported sharing'); } },
    {}
  ].forEach(wx => {
    let loaded = false;
    let shown = false;
    const page = shareRuntime(wx).define({
      onLoad() { loaded = true; },
      onShow() { shown = true; }
    });
    assert.doesNotThrow(() => page.onLoad({}));
    assert.doesNotThrow(() => page.onShow());
    assert.equal(loaded, true);
    assert.equal(shown, true);
    assert.equal(page.onShareAppMessage().path, '/pages/share/share');
    assert.equal(page.onShareTimeline().query, 'appShare=1');
  });
});

function appRuntime(wxOverrides = {}) {
  let app;
  const calls = { sync: 0, restore: 0, notices: 0, cloud: [] };
  const wx = Object.assign({ cloud: { init(options) { calls.cloud.push(options); } } }, wxOverrides);
  loadScript('app.js', {
    './config/env': { envId: 'test-env' },
    './services/account': {
      syncTabBar() { calls.sync += 1; },
      restore() { calls.restore += 1; return Promise.resolve(); }
    },
    './services/notifications': { signal() { calls.notices += 1; } }
  }, {
    App: definition => { app = definition; },
    wx
  });
  return { app, calls, wx };
}

test('the application stays offline in single-page mode and initializes once after full entry', () => {
  const { app, calls } = appRuntime();
  app.onLaunch({ scene: 1154 });
  app.onShow({ scene: 1154 });
  assert.equal(app.globalData.singlePage, true);
  assert.equal(app.globalData.cloudReady, false);
  assert.equal(calls.sync, 0);
  assert.equal(calls.restore, 0);
  assert.equal(calls.notices, 0);
  assert.equal(calls.cloud.length, 0);
  app.onShow({ scene: 1001 });
  assert.equal(app.globalData.singlePage, false);
  assert.equal(app.globalData.cloudReady, true);
  assert.equal(calls.restore, 1);
  assert.equal(calls.cloud.length, 1);
  assert.equal(calls.cloud[0].env, 'test-env');
  assert.equal(calls.notices, 1);
  app.onShow({ scene: 1007 });
  app.onShow({ scene: 1154 });
  app.onShow({ scene: 1001 });
  assert.equal(calls.restore, 1);
  assert.equal(calls.cloud.length, 1);
  assert.equal(calls.notices, 3);
});

test('an ordinary application launch does not initialize cloud twice on its first show', () => {
  const { app, calls } = appRuntime();
  app.onLaunch({ scene: 1001 });
  app.onShow({ scene: 1001 });
  assert.equal(calls.restore, 1);
  assert.equal(calls.cloud.length, 1);
  assert.equal(calls.notices, 1);
});

test('old clients use remembered full-app entry rather than a permanent single-page launch scene', () => {
  [
    {},
    { getEnterOptionsSync() { throw new Error('Unsupported entry options'); } }
  ].forEach(overrides => {
    const { app, calls, wx } = appRuntime(Object.assign({
      getLaunchOptionsSync() { return { scene: 1154 }; }
    }, overrides));
    const runtime = shareRuntime(wx, { getApp: () => app });
    const events = [];
    assert.equal(app.globalData.entryOptions, null);
    assert.equal(app.globalData.singlePage, false);
    const earlyPage = runtime.define({
      onLoad() { events.push('early-load'); },
      onShow() { events.push('early-show'); }
    });
    assert.equal(earlyPage.data.appSharePreview, true);
    assert.equal(earlyPage.data.appShareSinglePage, true);
    app.onLaunch({ scene: 1154, query: { appShare: '1', id: 'private-plant' } });
    assert.equal(app.globalData.entryOptions.scene, 1154);
    assert.deepEqual(JSON.parse(JSON.stringify(app.globalData.entryOptions.query)), { appShare: '1' });
    assert.equal(calls.cloud.length, 0);
    const launchedPage = runtime.define({
      onLoad() { throw new Error('No private initialization after single-page launch'); },
      onShow() { throw new Error('No private refresh after single-page launch'); }
    });
    launchedPage.onLoad({});
    launchedPage.onShow();
    assert.equal(launchedPage.data.appSharePreview, true);
    assert.equal(launchedPage.data.appShareSinglePage, true);
    app.onShow({ scene: 1001 });
    assert.equal(app.globalData.entryOptions.scene, 1001);
    assert.equal(app.globalData.singlePage, false);
    earlyPage.onLoad({});
    earlyPage.onShow();
    assert.equal(earlyPage.data.appSharePreview, false);
    assert.equal(earlyPage.data.appShareSinglePage, false);
    const page = runtime.define({
      onLoad() { events.push('load'); },
      onShow() { events.push('show'); }
    });
    assert.equal(page.data.appSharePreview, false);
    assert.equal(page.data.appShareSinglePage, false);
    page.onLoad({});
    page.onShow();
    assert.deepEqual(events, ['early-load', 'early-show', 'load', 'show']);
    assert.equal(page.data.appSharePreview, false);
    assert.equal(page.data.appShareSinglePage, false);
    app.onShow({ scene: 1007 });
    assert.equal(calls.cloud.length, 1);
    assert.equal(calls.restore, 1);
  });
});

test('every registered page isolates private content and notification hosts behind the public preview', () => {
  assert.ok(appConfig.usingComponents['notice-center']);
  assert.equal(appConfig.usingComponents['share-preview'], '/components/share-preview/share-preview');
  appConfig.pages.forEach(route => {
    const wxml = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
    const firstTag = wxml.slice(0, wxml.indexOf('>') + 1);
    assert.match(firstTag, /^\s*<share-preview\b/, route);
    assert.match(firstTag, /wx:if="\{\{appSharePreview\}\}"/, route);
    assert.match(firstTag, /single-page="\{\{appShareSinglePage\}\}"/, route);
    assert.match(firstTag, /bindsharehelp="showShareHelp"/, route);
    assert.match(wxml, /(?:<\/share-preview>|\/>)\s*<block wx:else>/, route);
    assert.match(wxml, /<\/block>\s*$/, route);
    assert.ok(wxml.indexOf('<notice-center') > wxml.indexOf('<block wx:else>'), route);
    assert.match(fs.readFileSync(path.join(root, route + '.js'), 'utf8'), /definePage\(/, route);
  });
});

test('the shared preview contains no private data access and cannot navigate in single-page mode', () => {
  let definition;
  const navigations = [];
  const file = 'components/share-preview/share-preview.js';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'components/share-preview/share-preview.json'), 'utf8')).component, true);
  assert.doesNotMatch(source, /services\/(?:account|data|notifications)|wx\.(?:login|cloud|request|downloadFile|getStorageSync|setStorageSync)\b/);
  loadScript(file, {}, {
    Component: component => { definition = component; },
    wx: { reLaunch: options => navigations.push(options.url) }
  });
  const preview = Object.assign({}, definition.methods, {
    data: { singlePage: true },
    properties: { singlePage: true }
  });
  assert.equal(typeof preview.enterApp, 'function');
  preview.enterApp();
  assert.equal(navigations.length, 0);
  preview.data.singlePage = false;
  preview.properties.singlePage = false;
  preview.enterApp();
  assert.deepEqual(navigations, ['/pages/index/index']);
  const wxml = fs.readFileSync(path.join(root, 'components/share-preview/share-preview.wxml'), 'utf8');
  assert.match(wxml, /wx:if="\{\{!singlePage\}\}"/);
  assert.match(wxml, /open-type="share"/);
  assert.match(wxml, /前往小程序/);
});

test('share help describes both native menu entries without asking users to switch pages', () => {
  let modal;
  const wx = fakeWx();
  wx.showModal = options => { modal = options; };
  wx.getDeviceInfo = () => ({ platform: 'devtools' });
  const page = shareRuntime(wx).define({});
  page.showShareHelp();
  assert.match(modal.content, /右上角/);
  assert.match(modal.content, /发送给朋友/);
  assert.match(modal.content, /朋友圈/);
  assert.match(modal.content, /模拟/);
  assert.doesNotMatch(modal.content, /请打开“应用介绍”后/);
});

function excludedFromUpload(file, rules) {
  return rules.some(rule => rule.type === 'file' ? file === rule.value :
    rule.type === 'folder' && (file === rule.value || file.startsWith(rule.value + '/')));
}

test('upload packaging excludes local documents, development files and repository metadata', () => {
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  const rules = project.packOptions.ignore;
  assert.ok(rules.every(rule => rule.type === 'file' || rule.type === 'folder'));
  assert.deepEqual(project.packOptions.include, []);
  const folders = ['doc-fetch-resources', '.git', 'node_modules', 'cloudfunctions', 'assets/source', 'scripts', 'tests'];
  const files = [
    'project.private.config.json', '.gitignore', '.DS_Store', 'package.json', 'package-lock.json',
    'README.md', 'BACKEND_RECOMMENDATION.md', 'NEXT_DEVELOPMENT_PROMPT.md',
    'config/env.example.js', 'assets/zhizaozao.png'
  ];
  folders.forEach(folder => {
    assert.ok(rules.some(rule => rule.type === 'folder' && rule.value === folder), folder);
    assert.equal(excludedFromUpload(folder + '/example.txt', rules), true, folder);
  });
  files.forEach(file => {
    assert.ok(rules.some(rule => rule.type === 'file' && rule.value === file), file);
    assert.equal(excludedFromUpload(file, rules), true, file);
  });
});

test('upload packaging keeps every page, shared component and required runtime resource', () => {
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  const rules = project.packOptions.ignore;
  const required = new Set([
    'app.js', 'app.json', 'app.wxss', 'sitemap.json', 'config/env.js', 'config/releases.js', 'services/page.js'
  ]);
  const extensions = ['.js', '.json', '.wxml', '.wxss'];
  appConfig.pages.forEach(route => extensions.forEach(extension => required.add(route + extension)));
  Object.values(appConfig.usingComponents).forEach(route => {
    extensions.forEach(extension => required.add(route.replace(/^\//, '') + extension));
  });
  function addRuntimeFiles(directory) {
    fs.readdirSync(path.join(root, directory), { withFileTypes: true }).forEach(entry => {
      const file = directory + '/' + entry.name;
      if (entry.name.startsWith('.') || file === 'assets/source' || file === 'assets/zhizaozao.png' || file === 'config/env.example.js') return;
      if (entry.isDirectory()) addRuntimeFiles(file);
      else if (entry.isFile()) required.add(file);
    });
  }
  ['utils', 'services', 'config', 'assets'].forEach(addRuntimeFiles);
  required.forEach(file => {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
    assert.equal(excludedFromUpload(file, rules), false, file);
  });
  assert.ok(required.has('components/share-preview/share-preview.js'));
  assert.ok(required.has('components/share-preview/share-preview.wxml'));
  assert.ok(required.has('assets/icons/logo.png'));
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
