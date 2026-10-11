// pages/environments/environments.js 生长环境分类列表
const storage = require('../../utils/storage');

Page({
  data: {
    envs: []
  },

  onShow() {
    this.load();
  },

  load() {
    const envs = storage.getEnvs();
    // 计算每个环境下的植物数量
    const plants = storage.getPlants().filter(p => !p.memorialized);
    const withCount = envs.map(e => ({
      ...e,
      count: plants.filter(p => p.environmentId === e.id).length
    }));
    this.setData({ envs: withCount });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/environment-edit/environment-edit?id=' + id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/environment-edit/environment-edit' });
  }
});
