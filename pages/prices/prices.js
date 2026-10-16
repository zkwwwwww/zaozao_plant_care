// pages/prices/prices.js 在养植物价格汇总
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const expense = require('../../utils/expense');
const pagination = require('../../utils/pagination');

Page({
  data: {
    guest: false,
    loading: false,
    loadError: '',
    total: '0.00',
    pricedCount: 0,
    unpricedCount: 0,
    topPlant: null,
    list: [],
    hasMore: false
  },

  onShow() {
    if (!account.isAuthorized()) {
      this.setData({ guest: true });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    try {
      const bundle = await dataApi.loadBundle();
      const active = bundle.plants.filter(plant => !plant.memorialized && plant.status !== '死亡');
      const priced = active
        .filter(plant => Number(plant.price) > 0)
        .sort((a, b) => Number(b.price) - Number(a.price));
      const cents = priced.reduce((sum, plant) => sum + Math.round(Number(plant.price) * 100), 0);
      const top = expense.mostExpensive(active);
      this._allList = priced.map(plant => ({
        id: plant.id,
        name: plant.name,
        sub: plant.variety || plant.purchaseWay || '',
        photo: plant.photos[0] || '',
        price: format.money(plant.price)
      }));
      const page = pagination.slice(this._allList, 1);
      this.setData({
        loading: false,
        total: format.money(cents / 100),
        pricedCount: priced.length,
        unpricedCount: active.length - priced.length,
        topPlant: top ? { id: top.id, name: top.name, price: format.money(top.price) } : null,
        list: page.items,
        hasMore: page.hasMore
      });
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
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + e.currentTarget.dataset.id });
  }
});
