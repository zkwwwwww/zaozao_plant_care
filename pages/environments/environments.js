// pages/environments/environments.js 生长环境分类列表
const account = require('../../services/account');
const dataApi = require('../../services/data');
const pagination = require('../../utils/pagination');

Page({
  data: {
    envs: [],
    guest: false,
    loading: false,
    loadError: '',
    hasMore: false
  },

  onShow() {
    if (!account.requireLogin()) {
      this.setData({ envs: [], guest: account.isGuest(), loading: false, hasMore: false });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    try {
      const bundle = await dataApi.loadBundle();
      const plants = bundle.plants.filter(p => !p.memorialized);
      this._allEnvs = bundle.envs.map(env => Object.assign({}, env, {
        count: plants.filter(p => p.environmentId === env.id).length
      }));
      const page = pagination.slice(this._allEnvs, 1);
      this.setData({
        loading: false,
        envs: page.items,
        hasMore: page.hasMore
      });
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
    }
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const next = Math.floor(this.data.envs.length / pagination.PAGE_SIZE) + 1;
    const page = pagination.slice(this._allEnvs, next);
    this.setData({ envs: page.items, hasMore: page.hasMore });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/environment-edit/environment-edit?id=' + id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/environment-edit/environment-edit' });
  }
});
