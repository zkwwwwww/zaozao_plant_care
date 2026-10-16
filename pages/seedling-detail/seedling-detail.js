// pages/seedling-detail/seedling-detail.js 育苗详情
const account = require('../../services/account');
const dataApi = require('../../services/data');
const lineage = require('../../utils/lineage');
const pagination = require('../../utils/pagination');

Page({
  data: {
    id: '',
    seedling: null,
    mother: null,
    children: [],
    infoRows: [],
    notFound: false,
    loading: false,
    loadError: '',
    hasMoreChildren: false
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    this._alive = true;
    if (!account.requireLogin()) return;
    this.load();
  },

  onUnload() {
    this._alive = false;
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      if (this._alive) this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
      return;
    }
    if (!this._alive) return;
    const seedling = bundle.seedlings.find(item => item.id === this.data.id);
    if (!seedling) {
      this.setData({ loading: false, seedling: null, notFound: true });
      return;
    }
    let mother = null;
    if (seedling.motherType === 'plant') {
      const plant = bundle.plants.find(item => item.id === seedling.motherId);
      if (plant) mother = { type: 'plant', id: plant.id, name: plant.name, kind: '植物' };
    } else if (seedling.motherType === 'seedling') {
      const parent = bundle.seedlings.find(item => item.id === seedling.motherId);
      if (parent) mother = { type: 'seedling', id: parent.id, name: parent.name, kind: '育苗' };
    } else if (seedling.motherType === 'text') {
      mother = { type: 'text', name: seedling.motherText || '手写来源', kind: '来源', photos: seedling.motherPhotos };
    }
    const children = lineage.childrenOf({ type: 'seedling', id: seedling.id }, bundle.seedlings)
      .map(item => ({ id: item.id, name: item.name, sub: item.method + ' · ' + item.startDate, photo: item.photos[0] || '' }));
    this._allChildren = children;
    const childPage = pagination.slice(children, 1);
    const grid = seedling.gridRows && seedling.gridCols ? seedling.gridRows + ' 行 × ' + seedling.gridCols + ' 列' : '';
    const infoRows = [
      { label: '繁殖方式', value: seedling.method },
      { label: '育苗日期', value: seedling.startDate },
      { label: '计划数量', value: seedling.plannedCount ? seedling.plannedCount + ' 株' : '' },
      { label: '格位', value: grid },
      { label: '基质', value: seedling.substrate },
      { label: '容器', value: seedling.container },
      { label: '育苗场所', value: seedling.place }
    ].map(row => Object.assign(row, { value: row.value || '未填' }));
    this.setData({
      loading: false,
      notFound: false,
      seedling,
      mother,
      children: childPage.items,
      hasMoreChildren: childPage.hasMore,
      infoRows
    });
  },

  onReachBottom() {
    if (!this.data.hasMoreChildren) return;
    const next = Math.floor(this.data.children.length / pagination.PAGE_SIZE) + 1;
    const page = pagination.slice(this._allChildren, next);
    this.setData({ children: page.items, hasMoreChildren: page.hasMore });
  },

  previewPhoto(e) {
    wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.seedling.photos });
  },

  previewMotherPhoto(e) {
    wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.mother.photos || [] });
  },

  goMother() {
    const mother = this.data.mother;
    if (!mother || mother.type === 'text') return;
    const url = mother.type === 'plant'
      ? '/pages/plant-detail/plant-detail?id=' + mother.id
      : '/pages/seedling-detail/seedling-detail?id=' + mother.id;
    wx.navigateTo({ url });
  },

  goChild(e) {
    wx.navigateTo({ url: '/pages/seedling-detail/seedling-detail?id=' + e.currentTarget.dataset.id });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/seedling-edit/seedling-edit?id=' + this.data.id });
  },

  goLineage() {
    wx.navigateTo({ url: '/pages/lineage/lineage?type=seedling&id=' + this.data.id });
  },

  goPropagate() {
    wx.navigateTo({ url: '/pages/seedling-edit/seedling-edit?motherType=seedling&motherId=' + this.data.id });
  },

  goBack() {
    wx.navigateBack();
  },

  remove() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    const seedling = this.data.seedling;
    const childCount = (this._allChildren || []).length;
    const extra = childCount ? '它的 ' + childCount + ' 个子代会改为手写来源。' : '';
    wx.showModal({
      title: '删除育苗',
      content: '将删除「' + seedling.name + '」及其照片。' + extra + '确定吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.deleteSeedling(seedling.id);
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          wx.navigateBack();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
        }
      }
    });
  }
});
