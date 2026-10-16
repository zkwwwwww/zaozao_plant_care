// pages/seedlings/seedlings.js 育苗列表
const account = require('../../services/account');
const dataApi = require('../../services/data');
const pagination = require('../../utils/pagination');

function motherLabel(item, plants, seedlings) {
  if (item.motherType === 'plant') {
    const plant = plants.find(p => p.id === item.motherId);
    return plant ? '母株：' + plant.name : '';
  }
  if (item.motherType === 'seedling') {
    const parent = seedlings.find(s => s.id === item.motherId);
    return parent ? '母株：' + parent.name : '';
  }
  if (item.motherType === 'text') return '来源：' + (item.motherText || '手写来源');
  return '';
}

Page({
  data: {
    guest: false,
    loading: false,
    loadError: '',
    list: [],
    hasMore: false
  },

  onShow() {
    if (!account.isAuthorized()) {
      this.setData({ guest: true, list: [], hasMore: false, loading: false, loadError: '' });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    try {
      const bundle = await dataApi.loadBundle();
      const list = bundle.seedlings.map(item => Object.assign({}, item, {
        photo: item.photos[0] || '',
        mother: motherLabel(item, bundle.plants, bundle.seedlings)
      }));
      this._allList = list;
      const page = pagination.slice(list, 1);
      this.setData({ loading: false, list: page.items, hasMore: page.hasMore });
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
    }
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const next = Math.floor(this.data.list.length / pagination.PAGE_SIZE) + 1;
    const page = pagination.slice(this._allList, next);
    this.setData({ list: page.items, hasMore: page.hasMore });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/seedling-detail/seedling-detail?id=' + e.currentTarget.dataset.id });
  },

  goAdd() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/seedling-edit/seedling-edit' });
  }
});
