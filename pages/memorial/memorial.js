// pages/memorial/memorial.js 植物纪念碑
const account = require('../../services/account');
const dataApi = require('../../services/data');

Page({
  data: {
    list: [],
    plants: [],
    loading: false,
    loadError: ''
  },

  onShow() {
    if (!account.requireLogin()) return;
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
      return;
    }
    const list = bundle.memorials.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const withText = list.map(m => ({
      ...m,
      typeCls: m.type === '送人' ? 'tag-blue' : 'tag-gray'
    }));
    this.setData({ loading: false, loadError: '', list: withText, plants: bundle.plants });
  },

  // 查看对应植物（可能已删除）
  goPlant(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.plants.some(plant => plant.id === id)) {
      wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + id });
    } else {
      wx.showToast({ title: '对应植物已被删除', icon: 'none' });
    }
  },

  previewPhoto(e) {
    const m = this.data.list.find(x => x.id === e.currentTarget.dataset.id);
    if (m && m.photos && m.photos.length) {
      wx.previewImage({ current: m.photos[0], urls: m.photos });
    }
  }
});
