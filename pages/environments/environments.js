// pages/environments/environments.js 生长环境分类列表
const account = require('../../services/account');
const dataApi = require('../../services/data');

Page({
  data: {
    envs: [],
    guest: false,
    loading: false,
    loadError: ''
  },

  onShow() {
    if (!account.requireLogin()) {
      this.setData({ envs: [], guest: account.isGuest(), loading: false });
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
      this.setData({
        loading: false,
        envs: bundle.envs.map(env => Object.assign({}, env, {
          count: plants.filter(p => p.environmentId === env.id).length
        }))
      });
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
    }
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/environment-edit/environment-edit?id=' + id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/environment-edit/environment-edit' });
  }
});
