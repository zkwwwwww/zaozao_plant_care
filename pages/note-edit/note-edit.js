// pages/note-edit/note-edit.js 添加养护记录
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const constants = require('../../utils/constants');
const media = require('../../utils/media');

Page({
  data: {
    plantId: '',
    plantName: '',
    careTypes: constants.CARE_TYPES,
    careTypeIndex: 0,
    isSavingPhoto: false,
    isSubmitting: false,
    loadError: '',
    form: {
      type: '浇水',
      date: format.today(),
      content: ''
    },
    photo: ''
  },

  async onLoad(options) {
    if (!account.requireLogin()) return;
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      this.setData({ loadError: error.message || '读取失败，请返回重试' });
      return;
    }
    const plant = bundle.plants.find(item => item.id === options.plantId);
    if (plant) {
      const requestedType = options.type ? decodeURIComponent(options.type) : '';
      const careTypeIndex = constants.CARE_TYPES.indexOf(requestedType);
      const type = careTypeIndex >= 0 ? requestedType : constants.CARE_TYPES[0];
      this.setData({
        plantId: options.plantId,
        plantName: plant.name,
        careTypeIndex: Math.max(0, careTypeIndex),
        'form.type': type
      });
    } else {
      this.setData({ loadError: '植物不存在或已被删除' });
    }
  },

  onType(e) {
    const careTypeIndex = Number(e.detail.value);
    this.setData({
      careTypeIndex,
      'form.type': constants.CARE_TYPES[careTypeIndex]
    });
  },

  onDate(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  onContent(e) {
    this.setData({ 'form.content': e.detail.value });
  },

  addPhoto() {
    if (this.data.isSavingPhoto) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const p = res.tempFiles[0].tempFilePath;
        this.setData({ isSavingPhoto: true });
        wx.showLoading({ title: '保存照片中', mask: true });
        try {
          const savedFilePath = await media.saveImage(p);
          this.setData({ photo: savedFilePath });
        } catch (error) {
          wx.showToast({ title: '照片保存失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ isSavingPhoto: false });
        }
      }
    });
  },

  removePhoto() {
    this.setData({ photo: '' });
  },

  previewPhoto() {
    if (this.data.photo) wx.previewImage({ current: this.data.photo, urls: [this.data.photo] });
  },

  async save() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    if (this.data.loadError) return;
    if (this.data.isSavingPhoto) {
      wx.showToast({ title: '照片仍在保存，请稍候', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;
    const { plantId, form, photo } = this.data;
    if (!form.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await dataApi.saveRecord({
        plantId,
        type: form.type,
        date: form.date,
        content: form.content.trim(),
        photo: photo || ''
      });
      wx.showToast({ title: '已记录', icon: 'success' });
      wx.navigateBack();
    } catch (error) {
      this.setData({ isSubmitting: false });
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
