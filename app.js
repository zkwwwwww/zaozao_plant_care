// app.js
const envConfig = require('./config/env');
const account = require('./services/account');
const notifications = require('./services/notifications');

App({
  onLaunch(options) {
    this.globalData.singlePage = !!(options && options.scene === 1154);
    if (this.globalData.singlePage) return;
    account.syncTabBar();
    this.initCloud();
  },

  onShow() {
    if (this.globalData.singlePage) return;
    account.syncTabBar();
    notifications.signal();
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
    cloudReady: false,
    sessionReady: null
  }
});
