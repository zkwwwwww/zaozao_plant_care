const definePage = require('../../services/page');

definePage({
  data: { singlePage: false },
  onLoad() {
    const options = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    this.setData({ singlePage: options.scene === 1154 });
  },
  onShareTimeline() {
    return { title: '植早早，记下每一株植物的生长与陪伴', query: '', imageUrl: '/assets/icons/logo.png' };
  },
  enterApp() { wx.switchTab({ url: '/pages/index/index' }); }
});
