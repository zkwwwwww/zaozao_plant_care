// pages/plant-detail/plant-detail.js 植物详情：信息 + 照片 + 养护时间线 + 纪念
const storage = require('../../utils/storage');
const account = require('../../services/account');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const constants = require('../../utils/constants');

Page({
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
    notFound: false
  },

  onLoad(options) {
    this.setData({ id: options.id });
  },

  onShow() {
    if (!account.requireLogin()) return;
    this.loadDetail();
  },

  loadDetail() {
    const id = this.data.id;
    const plant = storage.getPlant(id);
    if (!plant) {
      this.setData({ plant: null, notFound: true });
      return;
    }
    const env = plant.environmentId ? storage.getEnv(plant.environmentId) : null;
    const memorial = storage.getMemorial(id);
    const records = (plant.records || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const tasks = plant.memorialized ? [] : reminder.plantTasks(plant);

    this.setData({
      plant,
      notFound: false,
      env,
      memorial,
      photos: plant.photos || [],
      companion: format.companionText(plant.companionStart || plant.purchaseDate),
      tasks,
      records
    });
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

  // 展示图片
  previewPhoto(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: this.data.photos });
  },

  previewNotePhoto(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: [current] });
  },

  // 纪念：送人 / 去世
  onMemorial() {
    const plant = this.data.plant;
    if (!plant) return;
    const types = constants.MEMORIAL_TYPES;
    wx.showActionSheet({
      itemList: types,
      success: (res) => {
        const type = types[res.tapIndex];
        this.openMemorialDialog(type);
      }
    });
  },

  openMemorialDialog(type) {
    // 使用简单的弹层
    this.setData({ showMemorial: true, memorialType: type, memorialDate: format.today(), memorialNote: '' });
  },

  onMemorialDate(e) {
    this.setData({ memorialDate: e.detail.value });
  },

  onMemorialNote(e) {
    this.setData({ memorialNote: e.detail.value });
  },

  confirmMemorial() {
    if (!account.requireLogin()) return;
    const { id, memorialType, memorialDate, memorialNote, plant } = this.data;
    if (!memorialDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    const mem = {
      id: plant.id,
      name: plant.name,
      photos: plant.photos || [],
      type: memorialType,        // 送人 / 去世
      date: memorialDate,
      note: memorialNote || '',
      companion: format.companionText(plant.companionStart || plant.purchaseDate),
      createdAt: format.today()
    };
    storage.saveMemorial(mem);

    // 标记植物为已纪念，移出活跃列表
    plant.memorialized = true;
    plant.memorialType = memorialType;
    plant.memorialDate = memorialDate;
    storage.savePlant(plant);

    this.setData({ showMemorial: false });
    wx.showToast({ title: '已建立纪念碑', icon: 'success' });
    this.loadDetail();
  },

  cancelMemorial() {
    this.setData({ showMemorial: false });
  },

  // 撤销纪念（恢复为活跃植物）
  undoMemorial() {
    if (!account.requireLogin()) return;
    const plant = this.data.plant;
    if (!plant) return;
    wx.showModal({
      title: '撤销纪念',
      content: '将把该植物恢复到主页活跃列表，并删除纪念碑。确定吗？',
      confirmText: '撤销',
      confirmColor: '#2e7d5b',
      success: (res) => {
        if (!res.confirm) return;
        storage.removeMemorial(plant.id);
        plant.memorialized = false;
        delete plant.memorialType;
        delete plant.memorialDate;
        storage.savePlant(plant);
        wx.showToast({ title: '已恢复', icon: 'success' });
        this.loadDetail();
      }
    });
  },

  deletePlant() {
    if (!account.requireLogin()) return;
    const plant = this.data.plant;
    if (!plant) return;
    wx.showModal({
      title: '删除植物',
      content: '将永久删除「' + plant.name + '」及其全部记录，且无法恢复。确定吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: (res) => {
        if (!res.confirm) return;
        storage.deletePlant(plant.id);
        storage.removeMemorial(plant.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        wx.navigateBack();
      }
    });
  }
});
