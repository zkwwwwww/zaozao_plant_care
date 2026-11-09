const definePage = require('../../services/page');

definePage({
  data: { singlePage: false },
  onLoad() {
    const options = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    this.setData({ singlePage: options.scene === 1154 });
  },
  enterApp() { wx.switchTab({ url: '/pages/index/index' }); }
});
