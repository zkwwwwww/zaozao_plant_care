const account = require('../../services/account');
const dataApi = require('../../services/data');
const { uniqueId } = require('../../utils/id');

const definePage = require('../../services/page');

definePage({
  data: {
    plantId: '',
    plant: null,
    tasks: [],
    draft: '',
    busy: false,
    loadError: ''
  },

  onLoad(options) {
    this.setData({ plantId: options.plantId || '' });
  },

  onShow() {
    if (!account.requireLogin()) return;
    this.load();
  },

  async load() {
    try {
      const bundle = await dataApi.loadBundle();
      const plant = bundle.plants.find(item => item.id === this.data.plantId);
      if (!plant) {
        this.setData({ loadError: '植物不存在或已被删除', plant: null, tasks: [] });
        return;
      }
      const tasks = (plant.manualTasks || []).slice().sort((a, b) => {
        if (a.done === b.done) return (b.createdAt || '').localeCompare(a.createdAt || '');
        return a.done ? 1 : -1;
      });
      this.setData({ plant, tasks, loadError: '' });
    } catch (error) {
      this.setData({ loadError: error.message || '读取失败' });
    }
  },

  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },

  async addTask() {
    const title = (this.data.draft || '').trim();
    if (!title) {
      wx.showToast({ title: '请填写任务内容', icon: 'none' });
      return;
    }
    if (this.data.busy || !this.data.plant) return;
    if ((this.data.plant.manualTasks || []).length >= 50) {
      wx.showToast({ title: '最多 50 条，请先删除不需要的任务', icon: 'none' });
      return;
    }
    this.setData({ busy: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (!this._draftTaskId) this._draftTaskId = uniqueId('mt');
      await dataApi.addManualTask(this.data.plantId, this._draftTaskId, title);
      this._draftTaskId = '';
      await this.load();
      this.setData({ draft: '' });
      wx.showToast({ title: '已添加', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ busy: false });
    }
  },

  async toggleTask(e) {
    if (this.data.busy || !this.data.plant) return;
    const id = e.currentTarget.dataset.id;
    const task = (this.data.plant.manualTasks || []).find(item => item.id === id);
    if (!task) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await dataApi.setManualTask(this.data.plantId, id, !task.done);
      await this.load();
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ busy: false });
    }
  },

  removeTask(e) {
    if (this.data.busy || !this.data.plant) return;
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除任务',
      content: '确定删除这条手动任务吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm || this.data.busy) return;
        this.setData({ busy: true });
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.removeManualTask(this.data.plantId, id);
          await this.load();
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ busy: false });
        }
      }
    });
  }
});
