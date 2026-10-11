// pages/note-edit/note-edit.js 添加养护记录
const storage = require('../../utils/storage');
const account = require('../../services/account');
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

  onLoad(options) {
    if (!account.requireLogin()) return;
    const plant = storage.getPlant(options.plantId);
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

  save() {
    if (!account.requireLogin()) return;
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
    if (!storage.getPlant(plantId)) {
      this.setData({ loadError: '植物不存在或已被删除' });
      return;
    }
    this.setData({ isSubmitting: true });
    const record = {
      id: storage.genId('rec'),
      type: form.type,
      date: form.date,
      content: form.content.trim(),
      photo: photo || ''
    };
    try {
      storage.addRecord(plantId, record);
      wx.showToast({ title: '已记录', icon: 'success' });
      wx.navigateBack();
    } catch (error) {
      this.setData({ isSubmitting: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  }
});
