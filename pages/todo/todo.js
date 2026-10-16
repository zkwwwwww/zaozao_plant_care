// pages/todo/todo.js 今日到期与逾期的养护，可单株或整组完成
const account = require('../../services/account');
const dataApi = require('../../services/data');
const reminder = require('../../utils/reminder');
const pagination = require('../../utils/pagination');

const RECORD_TYPE = { water: '浇水', fertilize: '施肥', repot: '换盆' };

Page({
  data: {
    loading: false,
    loadError: '',
    groups: [],
    total: 0,
    busy: false,
    hasMore: false
  },

  onShow() {
    if (!account.requireLogin()) return;
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    try {
      const bundle = await dataApi.loadBundle();
      const groups = reminder.dueTodayGroups(bundle.plants).filter(group => group.items.length);
      const total = groups.reduce((sum, group) => sum + group.items.length, 0);
      this._allGroups = groups;
      this._allTasks = groups.flatMap(group => group.items);
      this.setData({ loading: false, total });
      this.renderPage(1);
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
    }
  },

  renderPage(pageNumber) {
    const page = pagination.slice(this._allTasks, pageNumber);
    const groups = (this._allGroups || []).map(group => Object.assign({}, group, {
      items: page.items.filter(item => item.type === group.type)
    })).filter(group => group.items.length);
    this.setData({ groups, hasMore: page.hasMore });
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const visible = this.data.groups.reduce((sum, group) => sum + group.items.length, 0);
    this.renderPage(Math.floor(visible / pagination.PAGE_SIZE) + 1);
  },

  async complete(plantIds, type, label) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '记录中', mask: true });
    try {
      const result = await dataApi.batchCare(plantIds, RECORD_TYPE[type]);
      wx.hideLoading();
      wx.showToast({ title: '已记录 ' + result.saved + ' 株' + label, icon: 'none' });
      this.load();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '记录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  completeOne(e) {
    const { id, type } = e.detail;
    this.complete([id], type, RECORD_TYPE[type]);
  },

  completeGroup(e) {
    const group = (this._allGroups || []).find(item => item.type === e.currentTarget.dataset.type);
    if (!group) return;
    wx.showModal({
      title: '一键完成' + group.label,
      content: '为 ' + group.items.length + ' 株植物各记一条今天的' + group.label + '记录？',
      confirmText: '完成',
      confirmColor: '#2e7d5b',
      success: (res) => {
        if (res.confirm) this.complete(group.items.map(item => item.plantId), group.type, group.label);
      }
    });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + e.detail.id });
  },

  goReminders() {
    wx.switchTab({ url: '/pages/reminders/reminders' });
  }
});
