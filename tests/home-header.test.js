const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadScript, loadPage, fakeWx } = require('./helpers/runtime');
const format = require('../utils/format');
const engagement = require('../utils/engagement');
const { buildHeader } = require('../utils/home-header');

const TODAY = '2026-11-10';
const LOCAL_DATE = new Date(2026, 10, 10, 8, 30);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function plant(id, extra = {}) {
  return Object.assign({
    id, name: id, status: '健康', photos: [], tags: [], records: [], manualTasks: [],
    purchaseDate: '', companionStart: '', environmentId: ''
  }, extra);
}

function bundle(plants = []) {
  return { plants, envs: [], tags: [], seedlings: [] };
}

function makeHome(options = {}) {
  const state = { view: null, session: null, sessionReady: options.sessionReady || null };
  const calls = { reads: [], migrations: 0, stops: 0, navigation: [], prompts: 0, invalidations: 0 };
  function setAccount(view, identity = 'user-a') {
    state.view = Object.assign({ status: 'valid', nickName: '植物主人', avatarUrl: '/avatar-a.png', summary: '已登录' }, view);
    state.session = state.view.status === 'anonymous' ? null : {
      openid: identity,
      nickName: state.view.nickName,
      avatarUrl: state.view.avatarUrl,
      loggedInAt: 100,
      expiresAt: 1000000,
      authorized: state.view.status === 'valid'
    };
  }
  setAccount(options.view);
  const account = {
    displaySession: () => Object.assign({}, state.view),
    getSession: () => state.session,
    isAuthorized: () => state.view.status === 'valid',
    isSignedOut: () => state.view.status === 'anonymous',
    requireLogin: () => state.view.status === 'valid',
    promptLogin() { calls.prompts += 1; },
    cloudReady: () => true,
    syncTabBar() {},
    startGuestBrowsing() {},
    login: () => Promise.resolve(state.session)
  };
  const dataApi = {
    loadBundle(input) {
      calls.reads.push(plain(input));
      return options.loadBundle ? options.loadBundle(input, calls.reads.length) : Promise.resolve(bundle());
    },
    invalidateBundle() {
      calls.invalidations += 1;
      if (options.invalidateBundle) options.invalidateBundle();
    }
  };
  const wx = fakeWx();
  wx.stopPullDownRefresh = () => { calls.stops += 1; };
  wx.navigateTo = input => calls.navigation.push({ method: 'navigateTo', url: input.url });
  wx.switchTab = input => calls.navigation.push({ method: 'switchTab', url: input.url });
  const mocks = {
    '../../services/account': account,
    '../../services/data': dataApi,
    '../../services/migrate': { promptOnce() { calls.migrations += 1; return Promise.resolve(); } },
    '../../utils/format': Object.assign({}, format, { today: () => TODAY }),
    '../../utils/engagement': engagement
  };
  const page = loadPage('pages/index/index.js', mocks, wx);
  page.waitForSession = () => state.sessionReady;
  page.onLoad();
  return { page, state, calls, wx, mocks, setAccount };
}

function assertCleared(page) {
  assert.equal(page.data.plants.length, 0);
  assert.equal(page.data.todayTasks.length, 0);
  assert.equal(page.data.tagBar.length, 0);
  assert.equal(page.data.tagFilter, '');
  assert.deepEqual(plain(page.data.envMap), {});
  assert.equal(page.data.totalPlants, 0);
  assert.equal(page.data.visiblePlantCount, 0);
  assert.equal(page.data.hasMore, false);
  assert.deepEqual(plain(page.data.stats), { count: 0, seedlings: 0, overdue: 0 });
  assert.deepEqual(plain(page.data.todo), { total: 0, text: '' });
  assert.deepEqual(plain(page.data.monthlyCare), { total: 0, activeDays: 0, topName: '暂无', overdue: 0 });
  assert.equal(page._bundle, null);
  assert.equal(page._visiblePlants, null);
}

test('home header distinguishes valid, expired and guest accounts without exposing guest nicknames', () => {
  const cases = [
    { view: { status: 'valid', nickName: '小月' }, name: '小月', status: '已登录', className: 'active', action: '个人资料' },
    { view: { status: 'expired', nickName: '小月' }, name: '小月', status: '登录已过期', className: 'expired', action: '重新登录' },
    { view: { status: 'anonymous', nickName: '不应显示的姓名' }, name: '植物朋友', status: '访客模式', className: 'guest', action: '去登录' }
  ];
  cases.forEach(item => {
    const header = buildHeader(item.view, LOCAL_DATE);
    assert.equal(header.name, item.name);
    assert.equal(header.statusText, item.status);
    assert.equal(header.statusClass, item.className);
    assert.equal(header.accountAction, item.action);
    assert.equal(header.dateText, '11月10日 · 周二');
    assert.ok(header.description.length > 0);
    assert.ok(header.seasonNote.length > 0);
  });
  assert.match(buildHeader({ status: 'valid' }, LOCAL_DATE).description, /记录生长与养护/);
  assert.match(buildHeader({ status: 'expired' }, LOCAL_DATE).description, /重新登录/);
});

test('empty names fall back gracefully while long authenticated names remain intact', () => {
  ['valid', 'expired', 'anonymous'].forEach(status => {
    assert.equal(buildHeader({ status, nickName: '' }, LOCAL_DATE).name, '植物朋友');
  });
  assert.equal(buildHeader(undefined, LOCAL_DATE).name, '植物朋友');
  assert.equal(buildHeader({ status: 'unknown', nickName: '隐藏姓名' }, LOCAL_DATE).name, '植物朋友');
  const name = '植物朋友'.repeat(30);
  assert.equal(buildHeader({ status: 'valid', nickName: name }, LOCAL_DATE).name, name);
  assert.equal(buildHeader({ status: 'expired', nickName: name }, LOCAL_DATE).name, name);
});

test('home greeting follows explicit local hours and all four seasonal watering defaults', () => {
  [
    [0, '夜深了，早点休息'], [5, '夜深了，早点休息'], [6, '上午好'], [11, '上午好'],
    [12, '下午好'], [17, '下午好'], [18, '晚上好'], [23, '晚上好']
  ].forEach(([hour, greeting]) => {
    assert.equal(buildHeader({}, new Date(2026, 10, 10, hour)).greeting, greeting);
  });
  const seasons = [
    ['冬', 15], ['冬', 15], ['春', 10], ['春', 10], ['春', 10], ['夏', 5],
    ['夏', 5], ['夏', 5], ['秋', 10], ['秋', 10], ['秋', 10], ['冬', 15]
  ];
  seasons.forEach(([name, interval], month) => {
    const header = buildHeader({}, new Date(2026, month, 15, 8));
    assert.equal(header.seasonTitle, name + '季养护');
    assert.equal(header.seasonText, '默认浇水间隔 ' + interval + ' 天');
    assert.equal(header.seasonNote, '单株设置优先');
  });
});

test('home date and greeting use user-local time rather than the UTC date', () => {
  const helper = path.resolve(__dirname, '../utils/home-header.js');
  const source = 'const { buildHeader } = require(' + JSON.stringify(helper) + ');' +
    'process.stdout.write(JSON.stringify(buildHeader({}, new Date("2026-11-09T16:30:00Z"))));';
  [
    { timezone: 'Asia/Shanghai', date: '11月10日 · 周二', greeting: '夜深了，早点休息' },
    { timezone: 'America/Los_Angeles', date: '11月9日 · 周一', greeting: '上午好' }
  ].forEach(item => {
    const result = spawnSync(process.execPath, ['-e', source], {
      env: Object.assign({}, process.env, { TZ: item.timezone }), encoding: 'utf8', timeout: 5000
    });
    assert.equal(result.status, 0, result.stderr);
    const header = JSON.parse(result.stdout);
    assert.equal(header.dateText, item.date);
    assert.equal(header.greeting, item.greeting);
  });
});

test('home today list includes eligible manual tasks with unique IDs, names and photos', () => {
  const { page } = makeHome();
  const active = plant('active', {
    name: '同名植物', photos: ['/active.png'], manualTasks: [
      { id: 'one', title: '擦叶片', createdAt: format.addDays(TODAY, -1), done: false },
      { id: 'two', title: '擦叶片', createdAt: TODAY, done: false },
      { id: 'done', title: '已完成任务', createdAt: TODAY, done: true },
      { id: 'future', title: '未来任务', createdAt: format.addDays(TODAY, 1), done: false }
    ]
  });
  const sameName = plant('same-name', {
    name: '同名植物', photos: ['/same-name.png'], manualTasks: [{ id: 'one', title: '擦叶片', done: false }]
  });
  const care = extra => Object.assign({
    purchaseDate: format.addDays(TODAY, -10), customWaterInterval: 10,
    customFertInterval: 100, customRepotInterval: 365
  }, extra);
  page.renderBundle(bundle([
    active,
    sameName,
    plant('care-today', care({ photos: ['/care.png'] })),
    plant('care-overdue', care({ purchaseDate: format.addDays(TODAY, -11) })),
    plant('care-upcoming', care({ purchaseDate: format.addDays(TODAY, -9) })),
    plant('dead', { status: '死亡', manualTasks: [{ id: 'dead-task', title: '不应计入' }] }),
    plant('memorial', { memorialized: true, manualTasks: [{ id: 'memorial-task', title: '不应计入' }] })
  ]));
  const tasks = Array.from(page.data.todayTasks).filter(task => !task.summary);
  const manual = tasks.filter(task => task.taskId);
  assert.equal(page.data.todo.total, 4);
  assert.equal(tasks.length, 4);
  assert.equal(manual.length, 3);
  assert.equal(new Set(tasks.map(task => task.key)).size, 4);
  assert.deepEqual(manual.map(task => task.taskId).sort(), ['one', 'one', 'two']);
  assert.ok(manual.every(task => task.plantName === '同名植物'));
  assert.equal(manual.find(task => task.plantId === 'active').photo, '/active.png');
  assert.equal(manual.find(task => task.plantId === 'same-name').photo, '/same-name.png');
  assert.equal(tasks.find(task => task.plantId === 'care-today').photo, '/care.png');
  assert.equal(tasks.some(task => ['care-overdue', 'care-upcoming', 'dead', 'memorial'].includes(task.plantId)), false);
  assert.equal(page.data.stats.overdue, 1);
  assert.match(page.data.todo.text, /擦叶片 3/);
  assert.match(page.data.todo.text, /浇水 1/);
  assert.equal(page.data.todayTasks[0].summary, true);
  assert.equal(page.data.todayTasks[0].text, page.data.todo.text);
});

test('newer home requests win over late successes from an older request', async () => {
  const older = deferred();
  const newer = deferred();
  const { page, calls } = makeHome({ loadBundle: (_, count) => count === 1 ? older.promise : newer.promise });
  const oldRequest = page.onShow();
  await flush();
  const newRequest = page.onShow();
  await flush();
  assert.equal(calls.reads.length, 2);
  newer.resolve(bundle([plant('newer')]));
  await newRequest;
  older.resolve(bundle([plant('older')]));
  await oldRequest;
  assert.deepEqual(Array.from(page.data.plants, item => item.id), ['newer']);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.loadError, '');
});

test('late errors from an older home request cannot replace a successful newer result', async () => {
  const older = deferred();
  const newer = deferred();
  const { page } = makeHome({ loadBundle: (_, count) => count === 1 ? older.promise : newer.promise });
  const oldRequest = page.onShow();
  await flush();
  const newRequest = page.onShow();
  await flush();
  newer.resolve(bundle([plant('newer')]));
  await newRequest;
  older.reject(new Error('Old request failed'));
  await oldRequest;
  assert.deepEqual(Array.from(page.data.plants, item => item.id), ['newer']);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.loadError, '');
});

test('leaving the home page prevents pending reads from writing back', async () => {
  for (const lifecycle of ['onHide', 'onUnload']) {
    const pending = deferred();
    const { page } = makeHome({ loadBundle: () => pending.promise });
    const request = page.onShow();
    await flush();
    page[lifecycle]();
    pending.resolve(bundle([plant('late-private-plant')]));
    await request;
    assert.equal(page.data.plants.length, 0, lifecycle);
    assert.equal(page._bundle, null, lifecycle);
  }
});

test('logout clears private home fields and rejects a pending old-account response', async () => {
  const pending = deferred();
  const { page, setAccount } = makeHome({ loadBundle: () => pending.promise });
  const privateBundle = bundle([plant('private', { name: '私人植物', photos: ['/private.png'], records: [{ type: '测量', date: TODAY }] })]);
  privateBundle.envs = [{ id: 'private-env', name: '私人环境' }];
  privateBundle.tags = [{ id: 'private-tag', name: '私人标签' }];
  privateBundle.seedlings = [{ id: 'private-seedling' }];
  page.renderBundle(privateBundle);
  page.setData({ tagFilter: 'private-tag', loadError: 'Previous error', avatarFailed: true });
  const request = page.onShow();
  await flush();
  setAccount({ status: 'anonymous', nickName: '', avatarUrl: '', summary: '未登录' });
  page.onShow();
  assertCleared(page);
  assert.equal(page.data.guest, true);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.homeHeader.name, '植物朋友');
  assert.equal(page.data.account.nickName, '');
  assert.equal(page.data.account.avatarUrl, '');
  assert.equal(page.data.avatarFailed, false);
  pending.resolve(privateBundle);
  await request;
  assertCleared(page);
  assert.equal(page.data.homeHeader.name, '植物朋友');
  page.onReachBottom();
  assertCleared(page);
});

test('an expired account keeps its profile label but cannot render private plant data', () => {
  const { page, setAccount, calls } = makeHome();
  page.renderBundle(bundle([plant('private')]));
  setAccount({ status: 'expired', nickName: '旧昵称', avatarUrl: '/old.png' });
  page.onShow();
  assertCleared(page);
  assert.equal(page.data.guest, true);
  assert.equal(page.data.homeHeader.name, '旧昵称');
  assert.equal(page.data.homeHeader.statusText, '登录已过期');
  assert.equal(page.data.homeHeader.accountAction, '重新登录');
  assert.equal(calls.reads.length, 0);
  page.renderBundle(bundle([plant('blocked')]));
  assertCleared(page);
});

test('account changes clear old content before reading the new account and ignore the old response', async () => {
  const oldData = deferred();
  const newData = deferred();
  const { page, setAccount } = makeHome({ loadBundle: (_, count) => count === 1 ? oldData.promise : newData.promise });
  page.renderBundle(bundle([plant('previous-a')]));
  const oldRequest = page.onShow();
  await flush();
  setAccount({ nickName: '用户乙', avatarUrl: '/avatar-b.png' }, 'user-b');
  const newRequest = page.onShow();
  assert.equal(page.data.plants.length, 0);
  assert.equal(page.data.todayTasks.length, 0);
  assert.equal(page.data.homeHeader.name, '用户乙');
  assert.equal(page.data.account.avatarUrl, '/avatar-b.png');
  await flush();
  oldData.resolve(bundle([plant('late-a')]));
  await oldRequest;
  assert.equal(page.data.plants.length, 0);
  newData.resolve(bundle([plant('current-b')]));
  await newRequest;
  assert.deepEqual(Array.from(page.data.plants, item => item.id), ['current-b']);
  assert.equal(page.data.homeHeader.name, '用户乙');
});

test('an account change during a read refreshes the new identity even without a separate onShow', async () => {
  const oldData = deferred();
  const newData = deferred();
  const { page, setAccount, calls } = makeHome({ loadBundle: (_, count) => count === 1 ? oldData.promise : newData.promise });
  page.renderBundle(bundle([plant('previous-a')]));
  const oldRequest = page.onShow();
  await flush();
  setAccount({ nickName: '用户乙', avatarUrl: '/avatar-b.png' }, 'user-b');
  oldData.resolve(bundle([plant('late-a')]));
  await oldRequest;
  await flush();
  assert.equal(page.data.homeHeader.name, '用户乙');
  assert.equal(page.data.plants.length, 0);
  assert.equal(calls.reads.length, 2);
  newData.resolve(bundle([plant('current-b')]));
  await flush();
  assert.deepEqual(Array.from(page.data.plants, item => item.id), ['current-b']);
});

function sharedPendingBundle(promises) {
  let pending = null;
  let started = 0;
  return {
    loadBundle() {
      if (!pending) {
        assert.ok(promises[started], 'Unexpected extra shared bundle request');
        pending = promises[started];
        started += 1;
      }
      return pending;
    },
    invalidateBundle() { pending = null; },
    get started() { return started; },
    get pending() { return pending; }
  };
}

test('account switches replace shared pending reads, including hidden and legacy empty-ID sessions', async () => {
  for (const scenario of [
    { identity: 'user-a', hidden: false },
    { identity: 'user-a', hidden: true },
    { identity: '', hidden: false }
  ]) {
    const oldData = deferred();
    const newData = deferred();
    const shared = sharedPendingBundle([oldData.promise, newData.promise]);
    const { page, setAccount, calls } = makeHome(shared);
    setAccount({ nickName: '用户甲' }, scenario.identity);
    const oldRequest = page.onShow();
    await flush();
    assert.equal(shared.started, 1);
    assert.equal(calls.invalidations, 0);
    assert.equal(page._loadIdentity, scenario.identity);
    if (scenario.hidden) {
      page.onHide();
      assert.equal(page._loadIdentity, scenario.identity);
    }
    setAccount({ nickName: '用户乙', avatarUrl: '/avatar-b.png' }, 'user-b');
    const newRequest = page.onShow();
    await flush();
    assert.equal(calls.invalidations, 1);
    assert.equal(shared.started, 2);
    assert.equal(shared.pending, newData.promise);
    newData.resolve(bundle([plant('current-b')]));
    await newRequest;
    oldData.resolve(bundle([plant('late-a')]));
    await oldRequest;
    assert.deepEqual(Array.from(page.data.plants, item => item.id), ['current-b']);
    assert.equal(page.data.homeHeader.name, '用户乙');
    assert.equal(calls.invalidations, 1);
  }
});

test('first display and repeated same-account shows retain a legitimate shared pending read', async () => {
  const data = deferred();
  const shared = sharedPendingBundle([data.promise]);
  const { page, calls } = makeHome(shared);
  const first = page.onShow();
  await flush();
  const second = page.onShow();
  await flush();
  assert.equal(shared.started, 1);
  assert.equal(calls.invalidations, 0);
  data.resolve(bundle([plant('same-account')]));
  await Promise.all([first, second]);
  await page.onShow();
  assert.equal(shared.started, 1);
  assert.equal(calls.invalidations, 0);
  assert.deepEqual(Array.from(page.data.plants, item => item.id), ['same-account']);
});

test('entering guest mode clears the shared pending bundle once and blocks its old response', async () => {
  const oldData = deferred();
  const shared = sharedPendingBundle([oldData.promise]);
  const { page, calls, setAccount } = makeHome(shared);
  const request = page.onShow();
  await flush();
  setAccount({ status: 'anonymous', nickName: '', avatarUrl: '', summary: '未登录' });
  page.onShow();
  assert.equal(calls.invalidations, 1);
  assert.equal(shared.pending, null);
  assert.equal(page._loadIdentity, null);
  page.onShow();
  assert.equal(calls.invalidations, 1);
  oldData.resolve(bundle([plant('late-private')]));
  await request;
  assertCleared(page);
  assert.equal(page.data.homeHeader.name, '植物朋友');
});

test('direct loads, error retries and pull refreshes clear the old account even when the new read fails', async () => {
  for (const action of ['loadData', 'retryLoad', 'onPullDownRefresh']) {
    let cached = null;
    const { page, calls, setAccount } = makeHome({
      loadBundle(input, count) {
        if (cached) return cached;
        if (count > 1) throw new Error('用户乙读取失败');
        cached = Promise.resolve(bundle([plant('cached-a')]));
        return cached;
      },
      invalidateBundle() { cached = null; }
    });
    await page.onShow();
    assert.deepEqual(Array.from(page.data.plants, item => item.id), ['cached-a']);
    assert.equal(calls.invalidations, 0);
    setAccount({ nickName: '用户乙', avatarUrl: '/avatar-b.png' }, 'user-b');
    const request = page[action]({ type: 'tap' });
    assertCleared(page);
    assert.equal(page.data.homeHeader.name, '用户乙');
    assert.equal(page.data.account.avatarUrl, '/avatar-b.png');
    await request;
    assertCleared(page);
    assert.equal(calls.invalidations, 1);
    assert.equal(calls.reads.length, 2);
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, '用户乙读取失败');
    assert.equal(page.data.homeHeader.name, '用户乙');
  }
});

test('silent session restoration updates the home profile before the first data read', async () => {
  const restoration = deferred();
  const { page, setAccount, calls } = makeHome({
    view: { nickName: '缓存昵称', avatarUrl: '/cached.png' }, sessionReady: restoration.promise
  });
  const request = page.onShow();
  await flush();
  assert.equal(page.data.homeHeader.name, '缓存昵称');
  assert.equal(calls.reads.length, 0);
  assert.equal(calls.migrations, 0);
  setAccount({ nickName: '恢复后的昵称', avatarUrl: '/restored.png' });
  restoration.resolve();
  await request;
  assert.equal(page.data.homeHeader.name, '恢复后的昵称');
  assert.equal(page.data.account.avatarUrl, '/restored.png');
  assert.equal(calls.reads.length, 1);
  assert.equal(calls.migrations, 1);
});

test('a signout during silent restoration clears the cached header and prevents a private read', async () => {
  const restoration = deferred();
  const { page, setAccount, calls } = makeHome({ sessionReady: restoration.promise });
  const request = page.onShow();
  await flush();
  setAccount({ status: 'anonymous', nickName: '', avatarUrl: '', summary: '未登录' });
  restoration.resolve();
  await request;
  await flush();
  assertCleared(page);
  assert.equal(page.data.homeHeader.name, '植物朋友');
  assert.equal(page.data.loading, false);
  assert.equal(calls.reads.length, 0);
});

test('a failed silent restoration still allows the valid cached session to load', async () => {
  const restoration = deferred();
  const { page, calls } = makeHome({ sessionReady: restoration.promise });
  const request = page.onShow();
  await flush();
  restoration.reject(new Error('Restore unavailable'));
  await request;
  assert.equal(calls.reads.length, 1);
  assert.equal(page.data.homeHeader.statusText, '已登录');
  assert.equal(page.data.loadError, '');
});

test('the session wait helper reads App restoration safely and tolerates a missing App', () => {
  const restoration = deferred();
  const { mocks, wx } = makeHome();
  let page;
  let app = { globalData: { sessionReady: restoration.promise } };
  loadScript('pages/index/index.js', Object.assign({}, mocks, {
    '../../services/page': definition => { page = definition; }
  }), { wx, getApp() { if (!app) throw new Error('App not ready'); return app; } });
  assert.equal(page.waitForSession(), restoration.promise);
  app = null;
  assert.equal(page.waitForSession(), null);
  restoration.resolve();
});

test('avatar failures apply only to the current source and reset when the profile avatar changes', () => {
  const { page, setAccount } = makeHome();
  page.refreshHeader();
  page.onHeaderAvatarError({ currentTarget: { dataset: { src: '/wrong.png' } } });
  assert.equal(page.data.avatarFailed, false);
  page.onHeaderAvatarError({ currentTarget: { dataset: { src: '/avatar-a.png' } } });
  assert.equal(page.data.avatarFailed, true);
  page.refreshHeader();
  assert.equal(page.data.avatarFailed, true);
  setAccount({ avatarUrl: '/avatar-b.png' });
  page.refreshHeader();
  assert.equal(page.data.avatarFailed, false);
  page.onHeaderAvatarError({ currentTarget: { dataset: { src: '/avatar-a.png' } } });
  page.onHeaderAvatarError({ currentTarget: { dataset: { src: '' } } });
  page.onHeaderAvatarError({});
  assert.equal(page.data.avatarFailed, false);
  page.onHeaderAvatarError({ currentTarget: { dataset: { src: '/avatar-b.png' } } });
  assert.equal(page.data.avatarFailed, true);
  setAccount({ status: 'anonymous', nickName: '', avatarUrl: '' });
  page.refreshHeader();
  assert.equal(page.data.avatarFailed, false);
  page.onHeaderAvatarError({ currentTarget: { dataset: { src: '/avatar-b.png' } } });
  assert.equal(page.data.avatarFailed, false);
});

test('tap events are not treated as forced loads while a true refresh explicitly bypasses cache', async () => {
  const { page, calls } = makeHome();
  await page.loadData({ type: 'tap', currentTarget: { dataset: {} } });
  await page.loadData('true');
  await page.loadData(true);
  assert.deepEqual(calls.reads.map(input => input.force), [false, false, true]);
  page.onPullDownRefresh();
  await flush();
  assert.equal(calls.reads.at(-1).force, true);
});

test('error retry bypasses stale cache, clears the error and uses the dedicated tap handler', async () => {
  const fresh = deferred();
  const { page, calls } = makeHome({
    loadBundle(input, count) {
      if (count === 1) throw new Error('首次读取失败');
      return input.force === true ? fresh.promise : Promise.resolve(bundle([plant('stale-cache')]));
    }
  });
  await page.onShow();
  assert.equal(page.data.loadError, '首次读取失败');
  assert.equal(page.data.loading, false);
  const retry = page.retryLoad({ type: 'tap', currentTarget: { dataset: {} } });
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.loading, true);
  await flush();
  assert.deepEqual(calls.reads.map(input => input.force), [false, true]);
  fresh.resolve(bundle([plant('fresh-data')]));
  await retry;
  assert.deepEqual(Array.from(page.data.plants, item => item.id), ['fresh-data']);
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.loading, false);
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/index/index.wxml'), 'utf8');
  const errorView = wxml.match(/<view\b[^>]*class="[^"]*\bload-error\b[^"]*"[^>]*>/);
  assert.ok(errorView);
  assert.match(errorView[0], /bindtap="retryLoad"/);
  assert.doesNotMatch(errorView[0], /bindtap="loadData"/);
});

test('header account actions and today task navigation retain their normal destinations', () => {
  ['valid', 'expired', 'anonymous'].forEach(status => {
    const { page, calls } = makeHome({ view: { status } });
    page.goAccount();
    assert.deepEqual(calls.navigation, [{ method: 'switchTab', url: '/pages/account/account' }]);
  });
  const { page, calls, wx } = makeHome();
  page.goDetail({ currentTarget: { dataset: { id: 'manual-plant' } } });
  page.goCareReminders();
  assert.deepEqual(calls.navigation, [
    { method: 'navigateTo', url: '/pages/plant-detail/plant-detail?id=manual-plant' },
    { method: 'switchTab', url: '/pages/reminders/reminders' }
  ]);
  assert.equal(wx.storage.get('careEntrySection'), 'reminder');
});
