const env = require('../config/env');
const profile = require('../utils/profile');
const storage = require('../utils/storage');

const SESSION_KEY = 'accountSession';
const SIGNED_OUT_KEY = 'accountSignedOut';

function cloudReady() {
  return !!(typeof wx !== 'undefined' && wx.cloud && env.envId);
}

function getSession() {
  const value = wx.getStorageSync(SESSION_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function isSignedOut() {
  return wx.getStorageSync(SIGNED_OUT_KEY) === true;
}

function displaySession(now) {
  if (isSignedOut()) {
    return { nickName: '', avatarUrl: '', status: 'anonymous', summary: '未登录' };
  }
  const session = getSession();
  const status = profile.sessionStatus(session, now);
  if (status === 'valid') {
    return {
      nickName: session.nickName || '',
      avatarUrl: session.avatarUrl || '',
      status: status,
      summary: session.nickName || '已登录'
    };
  }
  if (status === 'expired') {
    return {
      nickName: session.nickName || '',
      avatarUrl: session.avatarUrl || '',
      status: status,
      summary: '登录已过期'
    };
  }
  return { nickName: '', avatarUrl: '', status: 'anonymous', summary: '未登录' };
}

function saveSession(session, options) {
  if (options && options.keepSignedOut) {
    if (isSignedOut()) return;
  } else {
    wx.setStorageSync(SIGNED_OUT_KEY, false);
  }
  wx.setStorageSync(SESSION_KEY, session);
}

function signOut() {
  wx.setStorageSync(SIGNED_OUT_KEY, true);
  wx.removeStorageSync(SESSION_KEY);
}

function callLogin(data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'login',
      data,
      success: (res) => resolve(res.result || {}),
      fail: (error) => {
        const message = (error && error.errMsg) || '';
        if (/not found|not exist|不存在|FUNCTION_NOT_FOUND/i.test(message)) {
          reject(new Error('登录云函数尚未部署'));
          return;
        }
        reject(new Error('网络异常，请重试'));
      }
    });
  });
}

function uploadAvatar(filePath) {
  const matched = String(filePath).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = matched ? matched[1].toLowerCase() : 'jpg';
  const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.' + ext;
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: () => reject(new Error('头像上传失败，请重试'))
    });
  });
}

async function login(input, options) {
  if (!cloudReady()) throw new Error('云开发未配置');
  const nickName = profile.normalizeNickName(input && input.nickName);
  let avatarUrl = (input && input.avatarUrl) || '';
  if (avatarUrl && !profile.isCloudFileId(avatarUrl)) {
    avatarUrl = await uploadAvatar(avatarUrl);
  }
  const result = await callLogin({
    nickName,
    avatarFileId: profile.isCloudFileId(avatarUrl) ? avatarUrl : ''
  });
  if (!result.ok) throw new Error(result.message || '登录失败，请重试');
  const loggedInAt = Date.now();
  const session = {
    openid: result.openid || '',
    nickName: (result.user && result.user.nickName) || '',
    avatarUrl: (result.user && result.user.avatarUrl) || '',
    authorized: !!(result.user && result.user.nickName),
    loggedInAt: loggedInAt,
    expiresAt: loggedInAt + profile.SESSION_TTL_MS
  };
  saveSession(session, options);
  return session;
}

function refresh() {
  if (isSignedOut()) return Promise.resolve(null);
  return login({ nickName: '', avatarUrl: '' }, { keepSignedOut: true });
}

function isAuthorized() {
  return displaySession().status === 'valid';
}

function openLoginGuide() {
  if (isAuthorized()) return;
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const current = pages.length ? pages[pages.length - 1] : null;
  if (current && current.route === 'pages/account/account') return;
  wx.switchTab({ url: '/pages/account/account' });
}

function requireLogin() {
  if (isAuthorized()) {
    storage.ensureDefaultEnvs();
    return true;
  }
  openLoginGuide();
  return false;
}

function restore() {
  const cached = displaySession();
  if (cached.status !== 'valid' || !cloudReady()) return Promise.resolve(cached);
  return refresh().then(() => displaySession()).catch(() => displaySession());
}

module.exports = {
  cloudReady,
  getSession,
  isSignedOut,
  displaySession,
  login,
  refresh,
  restore,
  isAuthorized,
  openLoginGuide,
  requireLogin,
  signOut
};
