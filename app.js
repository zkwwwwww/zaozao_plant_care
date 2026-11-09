// app.js
const envConfig = require('./config/env');
const account = require('./services/account');
const notifications = require('./services/notifications');

App({
  onLaunch(options) {
    this.rememberEntry(options);
    if (this.globalData.singlePage) return;
    account.syncTabBar();
    this.initCloud();
  },

  onShow(options) {
    const wasSinglePage = this.globalData.singlePage;
    this.rememberEntry(options);
    if (this.globalData.singlePage) return;
    if (wasSinglePage && !this.globalData.cloudReady) this.initCloud();
    account.syncTabBar();
    notifications.signal();
  },

  rememberEntry(options) {
    if (!options || typeof options.scene !== 'number') return;
    this.globalData.singlePage = options.scene === 1154;
    this.globalData.entryOptions = {
      scene: options.scene,
      query: { appShare: options.query && options.query.appShare }
    };
  },

  initCloud() {
    this.globalData.cloudReady = !!(wx.cloud && envConfig.envId);
    if (!this.globalData.cloudReady) return;
    wx.cloud.init({
      env: envConfig.envId,
      traceUser: true
    });
    this.globalData.sessionReady = account.restore().catch(() => {});
  },

  globalData: {
    singlePage: false,
    entryOptions: null,
    cloudReady: false,
    sessionReady: null
  }
});
