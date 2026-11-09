// pages/plant-detail/plant-detail.js 植物详情：信息 + 照片 + 养护时间线 + 纪念
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const constants = require('../../utils/constants');
const pagination = require('../../utils/pagination');

function tagNames(plant, tags) {
  const names = (plant.tags || [])
    .map(id => (tags.find(tag => tag.id === id) || {}).name)
    .filter(Boolean);
  return names.length ? names : [constants.UNTAGGED.name];
}

const definePage = require('../../services/page');

definePage({
  data: {
    id: '',
    plant: null,
    env: null,
    companion: '',
    tasks: [],
    records: [],
    careTypes: constants.CARE_TYPES,
    photos: [],
    memorial: null,
    statusCls: 'tag-green',
    tagNames: [],
    priceText: '未填',
    childCount: 0,
    manualTasks: [],
    memorialHint: '',
    notFound: false,
    loading: false,
    loadError: '',
    hasMoreRecords: false,
    taskBusy: false
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this._pendingMemorial = options.memorial ? decodeURIComponent(options.memorial) : '';
  },

  onShow() {
    this._alive = true;
    if (!account.requireLogin()) return;
    this.loadDetail();
  },

  onUnload() {
    this._alive = false;
  },

  async loadDetail() {
    const id = this.data.id;
    this.setData({ loading: true, loadError: '' });
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      if (!this._alive) return;
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
      return;
    }
    if (!this._alive) return;
    const plant = bundle.plants.find(item => item.id === id);
    if (!plant) {
      this.setData({ plant: null, notFound: true, loading: false });
      return;
    }
    const env = plant.environmentId ? bundle.envs.find(item => item.id === plant.environmentId) : null;
    const memorial = bundle.memorials.find(item => item.id === id) || null;
    const records = (plant.records || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    this._allRecords = records;
    const recordPage = pagination.slice(records, 1);
    const tasks = plant.memorialized ? [] : reminder.plantTasks(plant);

    this.setData({
      loading: false,
      plant,
      notFound: false,
      env,
      memorial,
      photos: plant.photos || [],
      companion: format.companionText(plant.companionStart || plant.purchaseDate),
      tasks,
      records: recordPage.items,
      hasMoreRecords: recordPage.hasMore,
      statusCls: constants.statusClass(plant.status),
      tagNames: tagNames(plant, bundle.tags),
      priceText: plant.price !== '' && plant.price != null ? '¥' + format.money(plant.price) : '未填',
      childCount: bundle.seedlings.filter(item => item.motherType === 'plant' && item.motherId === id).length,
      manualTasks: (plant.manualTasks || []).filter(item => !item.done).concat(
        (plant.manualTasks || []).filter(item => item.done)
      ).slice(0, 5)
    });
    if (this._pendingMemorial && !plant.memorialized) {
      this.openMemorialDialog(this._pendingMemorial);
    }
    this._pendingMemorial = '';
  },

  onReachBottom() {
    if (!this.data.hasMoreRecords) return;
    const next = Math.floor(this.data.records.length / pagination.PAGE_SIZE) + 1;
    const page = pagination.slice(this._allRecords, next);
    this.setData({ records: page.items, hasMoreRecords: page.hasMore });
  },

  goLineage() {
    wx.navigateTo({ url: '/pages/lineage/lineage?type=plant&id=' + this.data.id });
  },

  goPropagate() {
    wx.navigateTo({ url: '/pages/seedling-edit/seedling-edit?motherType=plant&motherId=' + this.data.id });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/plant-edit/plant-edit?id=' + this.data.id });
  },

  goBack() {
    wx.navigateBack();
  },

  goNote() {
    if (this.data.plant && this.data.plant.memorialized) {
      wx.showToast({ title: '请先恢复植物再添加记录', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/note-edit/note-edit?plantId=' + this.data.id });
  },

  goManualTasks() {
    wx.navigateTo({ url: '/pages/manual-tasks/manual-tasks?plantId=' + this.data.id });
  },

  editRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    if (!recordId) return;
    wx.navigateTo({
      url: '/pages/note-edit/note-edit?plantId=' + encodeURIComponent(this.data.id)
        + '&recordId=' + encodeURIComponent(recordId)
    });
  },

  // 展示图片
  previewPhoto(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: this.data.photos });
  },

  previewNotePhoto(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: [current] });
  },

  async ignoreTask(e) {
    if (this.data.taskBusy) return;
    const type = (e.detail && e.detail.type) || e.currentTarget.dataset.type;
    const plant = this.data.plant;
    if (!plant || !type) return;
    this.setData({ taskBusy: true });
    wx.showLoading({ title: '忽略中', mask: true });
    try {
      await dataApi.ignoreReminder(plant, type);
      wx.showToast({ title: '已延后一周期', icon: 'success' });
      this.loadDetail();
    } catch (error) {
      wx.showToast({ title: error.message || '忽略失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ taskBusy: false });
    }
  },

  async toggleManualTask(e) {
    if (this.data.taskBusy) return;
    const taskId = e.currentTarget.dataset.id;
    const plant = this.data.plant;
    if (!plant || !taskId) return;
    const task = (plant.manualTasks || []).find(item => item.id === taskId);
    if (!task) return;
    this.setData({ taskBusy: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await dataApi.setManualTask(plant.id, taskId, !task.done);
      wx.showToast({ title: '已更新', icon: 'success' });
      this.loadDetail();
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ taskBusy: false });
    }
  },

  // 植物告别：送人 / 去世（温馨化）
  onMemorial() {
    const plant = this.data.plant;
    if (!plant) return;
    const types = constants.MEMORIAL_TYPES;
    wx.showActionSheet({
      itemList: ['送给新的主人', '让它去往更好的地方'],
      success: (res) => {
        this.openMemorialDialog(types[res.tapIndex]);
      }
    });
  },

  openMemorialDialog(type) {
    const hint = type === '送人'
      ? '愿它在新的家里继续生长。'
      : '让它去往更好的地方，纪念碑会替你记得这段陪伴。';
    this.setData({
      showMemorial: true,
      memorialType: type,
      memorialHint: hint,
      memorialDate: format.today(),
      memorialNote: ''
    });
  },

  onMemorialDate(e) {
    this.setData({ memorialDate: e.detail.value });
  },

  onMemorialNote(e) {
    this.setData({ memorialNote: e.detail.value });
  },

  async confirmMemorial() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    const { id, memorialType, memorialDate, memorialNote, plant } = this.data;
    if (!memorialDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await dataApi.memorialize({
        plantId: id,
        type: memorialType,
        date: memorialDate,
        note: memorialNote || '',
        companion: format.companionText(plant.companionStart || plant.purchaseDate)
      });
      this.setData({ showMemorial: false });
      wx.showToast({ title: '已建立纪念碑', icon: 'success' });
      this.loadDetail();
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  cancelMemorial() {
    this.setData({ showMemorial: false });
  },

  // 撤销纪念（恢复为活跃植物）
  undoMemorial() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    const plant = this.data.plant;
    if (!plant) return;
    wx.showModal({
      title: '撤销纪念',
      content: '将把该植物恢复到主页活跃列表，并删除纪念碑。确定吗？',
      confirmText: '撤销',
      confirmColor: '#2e7d5b',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '恢复中', mask: true });
        try {
          await dataApi.restorePlant(plant.id);
          wx.showToast({ title: '已恢复', icon: 'success' });
          this.loadDetail();
        } catch (error) {
          wx.showToast({ title: error.message || '恢复失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  deletePlant() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    const plant = this.data.plant;
    if (!plant) return;
    wx.showModal({
      title: '删除植物',
      content: '将删除「' + plant.name + '」及其全部记录，且无法在小程序里恢复。确定吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.deletePlant(plant.id);
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
