// app.js
const envConfig = require('./config/env');
const account = require('./services/account');

App({
  onLaunch() {
    this.initCloud();
  },

  initCloud() {
    this.globalData.cloudReady = !!(wx.cloud && envConfig.envId);
    if (!this.globalData.cloudReady) return;
    wx.cloud.init({
      env: envConfig.envId,
      traceUser: true
    });
    account.restore().catch(() => {});
  },

  globalData: {
    cloudReady: false
  }
});
