const account = require('./account');
const format = require('../utils/format');
const engagement = require('../utils/engagement');
const releases = require('../config/releases');
const version = require('../utils/version');

const SETTINGS_KEY = 'updateNoticesEnabled';
const SEEN_KEY = 'lastSeenRelease';
let host = null;
let active = null;
let scope = '';
let revision = 0;
let paused = 0;
let timer = null;

function updatesEnabled() {
  return wx.getStorageSync(SETTINGS_KEY) !== false;
}

function setUpdatesEnabled(enabled) {
  wx.setStorageSync(SETTINGS_KEY, !!enabled);
  if (!enabled && active && active.kind === 'release') active = null;
  signal();
}

function userKey() {
  const session = account.getSession();
  return account.isAuthorized() && session && session.openid ? session.openid : '';
}

function stateKey(openid) {
  return 'dailyNotice:' + openid;
}

function observeBundle(bundle) {
  const openid = userKey();
  if (!openid) return null;
  const result = engagement.observe(wx.getStorageSync(stateKey(openid)), bundle, format.today());
  wx.setStorageSync(stateKey(openid), result.state);
  return result;
}

function celebration(kind, day, progress) {
  return {
    kind, day, celebrate: true,
    title: kind === 'completed' ? '今天的待办，全部完成！' : '恭喜，今天可以轻松一点',
    description: kind === 'completed' ? '每一份照顾，都在悄悄长成新的叶子。辛苦啦！' : '没有今天、逾期或未来两天的待办。把这份好心情，也留给自己。',
    groups: [], progress, button: '收下这份好心情'
  };
}

async function refresh() {
  const target = host;
  const token = ++revision;
  if (!target || paused) return;
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData.sessionReady) await app.globalData.sessionReady;
    if (host !== target || token !== revision || paused) return;
    const nextScope = userKey() || 'guest';
    if (scope !== nextScope || (active && active.day && active.day !== format.today())) active = null;
    scope = nextScope;
    if (active && active.kind === 'release' && !updatesEnabled()) active = null;
    if (!active && updatesEnabled() && version.shouldNotifyRelease(releases.current.version, wx.getStorageSync(SEEN_KEY))) {
      active = {
        kind: 'release', title: releases.current.title,
        description: '植早早 ' + releases.current.version + ' · ' + releases.current.date,
        changes: releases.current.changes, button: '知道了，开始今天的陪伴'
      };
      wx.setStorageSync(SEEN_KEY, releases.current.version);
    }
    if (!active && nextScope !== 'guest') {
      const bundle = await require('./data').loadBundle();
      if (host !== target || token !== revision || paused || nextScope !== userKey()) return;
      const result = observeBundle(bundle);
      if (!result) return;
      const progress = { done: result.done, total: result.total, percent: result.total ? Math.round(result.done * 100 / result.total) : 100 };
      if (result.allCompleted && !result.state.completedShown) {
        active = celebration('completed', result.state.day, progress);
        result.state.completedShown = true;
        result.state.dailyShown = true;
      } else if (!result.state.dailyShown) {
        active = result.summary.total ? {
          kind: 'daily', day: result.state.day, title: '今天，也一起好好生长',
          description: '先照顾今天和逾期的事项，再看看未来两天的安排。',
          groups: result.summary.groups.map(group => Object.assign({}, group, { items: group.items.slice(0, 12) })),
          progress, button: '查看全部待办'
        } : celebration('clear', result.state.day, progress);
        result.state.dailyShown = true;
      }
      wx.setStorageSync(stateKey(nextScope), result.state);
    }
    if (host === target && token === revision && !paused) target.render(active);
  } catch (error) {
    // 读取失败时不发送“没有待办”的假恭喜，也不消耗当天提醒。
    if (host === target && token === revision) target.render(null);
  }
}

function show(target) {
  host = target;
  refresh();
}

function hide(target) {
  if (host !== target) return;
  revision += 1;
  host = null;
  target.render(null);
}

function close(target, disableUpdates) {
  if (host !== target) return;
  if (disableUpdates) wx.setStorageSync(SETTINGS_KEY, false);
  active = null;
  target.render(null);
  refresh();
}

function signal() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; refresh(); }, 150);
}

function suspend() {
  paused += 1;
  revision += 1;
  if (host) host.render(null);
  return () => { paused = Math.max(0, paused - 1); signal(); };
}

module.exports = { updatesEnabled, setUpdatesEnabled, observeBundle, show, hide, close, signal, suspend };
