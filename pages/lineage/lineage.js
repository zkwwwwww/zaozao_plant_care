// pages/lineage/lineage.js 族谱：从最早的祖先展开所有子代
const account = require('../../services/account');
const dataApi = require('../../services/data');
const lineage = require('../../utils/lineage');
const pagination = require('../../utils/pagination');

Page({
  data: {
    type: '',
    id: '',
    currentKey: '',
    rows: [],
    generations: 0,
    loading: false,
    loadError: '',
    hasMore: false
  },

  onLoad(options) {
    const type = options.type === 'seedling' ? 'seedling' : 'plant';
    this.setData({ type, id: options.id || '', currentKey: lineage.nodeKey(type, options.id || '') });
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
    const { plants, seedlings } = bundle;
    const lookup = (node) => {
      if (node.type === 'plant') {
        const plant = plants.find(p => p.id === node.id);
        if (!plant) return null;
        return {
          name: plant.name,
          kind: '植物',
          sub: plant.memorialized ? '已纪念' : (plant.variety || plant.status),
          photo: plant.photos[0] || ''
        };
      }
      const item = seedlings.find(s => s.id === node.id);
      if (!item) return null;
      return { name: item.name, kind: '育苗', sub: item.method + ' · ' + item.startDate, photo: item.photos[0] || '' };
    };
    const root = lineage.rootOf({ type: this.data.type, id: this.data.id }, seedlings);
    const rows = lineage.flatten(root, lookup, seedlings).map(row => Object.assign(row, {
      indent: Math.min(row.depth, 5) * 36
    }));
    const generations = rows.reduce((max, row) => Math.max(max, row.depth + 1), 0);
    this._allRows = rows.length > 1 ? rows : [];
    const page = pagination.slice(this._allRows, 1);
    this.setData({ loading: false, rows: page.items, hasMore: page.hasMore, generations });
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const next = Math.floor(this.data.rows.length / pagination.PAGE_SIZE) + 1;
    const page = pagination.slice(this._allRows, next);
    this.setData({ rows: page.items, hasMore: page.hasMore });
  },

  goNode(e) {
    const { type, id } = e.currentTarget.dataset;
    const url = type === 'plant'
      ? '/pages/plant-detail/plant-detail?id=' + id
      : '/pages/seedling-detail/seedling-detail?id=' + id;
    wx.navigateTo({ url });
  },

  goPropagate() {
    wx.navigateTo({ url: '/pages/seedling-edit/seedling-edit?motherType=' + this.data.type + '&motherId=' + this.data.id });
  }
});
