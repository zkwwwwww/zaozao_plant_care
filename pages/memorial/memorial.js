// pages/memorial/memorial.js 植物纪念碑
const storage = require('../../utils/storage');
const account = require('../../services/account');
const format = require('../../utils/format');

Page({
  data: {
    list: []
  },

  onShow() {
    if (!account.requireLogin()) return;
    this.load();
  },

  load() {
    const list = storage.getMemorials().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const withText = list.map(m => ({
      ...m,
      typeCls: m.type === '送人' ? 'tag-blue' : 'tag-gray'
    }));
    this.setData({ list: withText });
  },

  // 查看对应植物（可能已删除）
  goPlant(e) {
    const id = e.currentTarget.dataset.id;
    if (storage.getPlant(id)) {
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
