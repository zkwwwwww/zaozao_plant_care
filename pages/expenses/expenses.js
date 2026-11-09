// pages/expenses/expenses.js 花费统计
const account = require('../../services/account');
const dataApi = require('../../services/data');
const constants = require('../../utils/constants');
const format = require('../../utils/format');
const expense = require('../../utils/expense');
const pagination = require('../../utils/pagination');

const definePage = require('../../services/page');

definePage({
  data: {
    guest: false,
    loading: false,
    loadError: '',
    modes: expense.MODES.concat([{ key: 'custom', label: '自定义' }]),
    mode: 'month',
    rangeStart: format.today().slice(0, 8) + '01',
    rangeEnd: format.today(),
    today: format.today(),
    series: [],
    selectedKey: '',
    periodTitle: '',
    periodTotal: '0.00',
    categories: [],
    items: [],
    allTotal: '0.00',
    plantValue: '0.00',
    grandTotal: '0.00',
    pricedCount: 0,
    unpricedCount: 0,
    priceItems: [],
    priceSortKey: 'price',
    priceSortAsc: false,
    topPlant: null,
    hasData: false,
    expenseHasMore: false,
    priceHasMore: false
  },

  onShow() {
    if (!account.isAuthorized()) {
      this.setData({ guest: true, hasData: false, loading: false, loadError: '' });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    try {
      const bundle = await dataApi.loadBundle();
      this._expenses = bundle.expenses;
      const activePlants = bundle.plants.filter(plant => !plant.memorialized && plant.status !== '死亡');
      const pricedPlants = activePlants.filter(plant => Number(plant.price) > 0);
      const top = expense.mostExpensive(activePlants);
      const plantValueCents = pricedPlants.reduce((sum, plant) => sum + Math.round(Number(plant.price) * 100), 0);
      const otherTotal = expense.sum(bundle.expenses);
      const plantValue = format.money(plantValueCents / 100);
      const grandCents = plantValueCents + Math.round(Number(otherTotal) * 100);
      this._pricedPlants = pricedPlants.map(plant => ({
        id: plant.id,
        name: plant.name,
        sub: plant.variety || plant.purchaseWay || '',
        photo: (plant.photos && plant.photos[0]) || '',
        price: format.money(plant.price),
        priceValue: Number(plant.price),
        time: plant.purchaseDate || plant.companionStart || ''
      }));
      this.setData({
        loading: false,
        hasData: bundle.expenses.length > 0 || pricedPlants.length > 0,
        allTotal: otherTotal,
        plantValue,
        grandTotal: format.money(grandCents / 100),
        pricedCount: pricedPlants.length,
        unpricedCount: activePlants.length - pricedPlants.length,
        topPlant: top ? { id: top.id, name: top.name, price: format.money(top.price), photo: (top.photos && top.photos[0]) || '' } : null
      });
      this.renderPricePage(1);
      this.render(this.data.selectedKey);
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
    }
  },

  render(selectedKey) {
    const mode = this.data.mode;
    const rows = this._expenses || [];
    if (mode === 'custom') {
      this.renderRange(selectedKey);
      return;
    }
    const series = expense.buildSeries(rows, mode, format.today());
    const keys = series.map(item => item.key);
    const key = keys.indexOf(selectedKey) >= 0 ? selectedKey : keys[keys.length - 1];
    const inPeriod = expense.inPeriod(rows, mode, key);
    const selected = series.find(item => item.key === key);
    const items = inPeriod.map(item => Object.assign({}, item, { amountText: format.money(item.amount) }));
    this._allItems = items;
    const page = pagination.slice(items, 1);
    this.setData({
      series: series.map(item => Object.assign(item, { selected: item.key === key })),
      selectedKey: key,
      periodTitle: periodTitle(mode, key, selected),
      periodTotal: expense.sum(inPeriod),
      categories: expense.categoryTotals(inPeriod, constants.EXPENSE_CATEGORIES),
      items: page.items,
      expenseHasMore: page.hasMore
    });
  },

  // 自定义区间：默认看整段，点柱子看单个时段，再点一次取消
  renderRange(selectedKey) {
    const { rangeStart, rangeEnd } = this.data;
    const rows = expense.inRange(this._expenses || [], rangeStart, rangeEnd);
    const result = expense.rangeSeries(rows, rangeStart, rangeEnd);
    const keys = result.series.map(item => item.key);
    const key = keys.indexOf(selectedKey) >= 0 ? selectedKey : '';
    const picked = key ? rows.filter(item => expense.periodKey(item.date, result.unit) === key) : rows;
    const items = picked.map(item => Object.assign({}, item, { amountText: format.money(item.amount) }));
    this._allItems = items;
    const page = pagination.slice(items, 1);
    this.setData({
      series: result.series.map(item => Object.assign(item, { selected: !key || item.key === key })),
      selectedKey: key,
      periodTitle: key ? rangeBucketTitle(result.unit, key) : rangeStart + ' 至 ' + rangeEnd,
      periodTotal: expense.sum(picked),
      categories: expense.categoryTotals(picked, constants.EXPENSE_CATEGORIES),
      items: page.items,
      expenseHasMore: page.hasMore
    });
  },

  onReachBottom() {
    const next = {};
    if (this.data.expenseHasMore) {
      const expensePage = pagination.slice(
        this._allItems,
        Math.floor(this.data.items.length / pagination.PAGE_SIZE) + 1
      );
      next.items = expensePage.items;
      next.expenseHasMore = expensePage.hasMore;
    }
    if (this.data.priceHasMore) {
      const pricePage = pagination.slice(
        this._allPriceItems,
        Math.floor(this.data.priceItems.length / pagination.PAGE_SIZE) + 1
      );
      next.priceItems = pricePage.items;
      next.priceHasMore = pricePage.hasMore;
    }
    if (Object.keys(next).length) this.setData(next);
  },

  onRangeStart(e) {
    const rangeStart = e.detail.value;
    const rangeEnd = rangeStart > this.data.rangeEnd ? rangeStart : this.data.rangeEnd;
    this.setData({ rangeStart, rangeEnd });
    this.render('');
  },

  onRangeEnd(e) {
    const rangeEnd = e.detail.value;
    const rangeStart = rangeEnd < this.data.rangeStart ? rangeEnd : this.data.rangeStart;
    this.setData({ rangeStart, rangeEnd });
    this.render('');
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.key;
    if (mode === this.data.mode) return;
    this.setData({ mode });
    this.render('');
  },

  pickBar(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.mode === 'custom' && key === this.data.selectedKey) {
      this.render('');
      return;
    }
    this.render(key);
  },

  switchPriceSort(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.priceSortKey) {
      this.setData({ priceSortAsc: !this.data.priceSortAsc });
    } else {
      this.setData({ priceSortKey: key, priceSortAsc: false });
    }
    this.renderPricePage(1);
  },

  renderPricePage(pageNumber) {
    const key = this.data.priceSortKey;
    const asc = this.data.priceSortAsc;
    const rows = (this._pricedPlants || []).slice().sort((a, b) => {
      if (key === 'time') {
        const left = a.time || '';
        const right = b.time || '';
        return asc ? left.localeCompare(right) : right.localeCompare(left);
      }
      return asc ? a.priceValue - b.priceValue : b.priceValue - a.priceValue;
    });
    this._allPriceItems = rows;
    const page = pagination.slice(rows, pageNumber);
    this.setData({
      priceItems: page.items,
      priceHasMore: page.hasMore
    });
  },

  goAdd() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/expense-edit/expense-edit' });
  },

  goEdit(e) {
    wx.navigateTo({ url: '/pages/expense-edit/expense-edit?id=' + e.currentTarget.dataset.id });
  },

  goPlant() {
    if (this.data.topPlant) wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + this.data.topPlant.id });
  },

  goPricePlant(e) {
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + e.currentTarget.dataset.id });
  }
});

function periodTitle(mode, key, selected) {
  if (!key) return '';
  if (mode === 'day') return key;
  if (mode === 'week') return key + ' 起的一周';
  if (mode === 'month') return key.slice(0, 4) + ' 年 ' + (selected ? selected.label : key);
  return key + ' 年';
}

function rangeBucketTitle(unit, key) {
  if (unit === 'day') return key;
  if (unit === 'month') return key.slice(0, 4) + ' 年 ' + Number(key.slice(5)) + ' 月';
  return key + ' 年';
}
