const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const report = require('../../utils/care-report');

const definePage = require('../../services/page');

definePage({
  data: {
    range: 'month',
    metrics: []
  },

  onShow() {
    if (!account.requireLogin()) return;
    this.load();
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.load();
  },

  async load() {
    try {
      const bundle = await dataApi.loadBundle();
      const today = format.today();
      this.setData({ metrics: report.metricsFor(bundle, this.data.range, today) });
    } catch (error) {
      wx.showToast({ title: error.message || '读取失败', icon: 'none' });
    }
  }
});
