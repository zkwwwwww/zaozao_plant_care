// pages/note-edit/note-edit.js 添加养护记录
const storage = require('../../utils/storage');
const format = require('../../utils/format');
const constants = require('../../utils/constants');

Page({
  data: {
    plantId: '',
    plantName: '',
    careTypes: constants.CARE_TYPES,
    form: {
      type: '浇水',
      date: format.today(),
      content: ''
    },
    photo: ''
  },

  onLoad(options) {
    const plant = storage.getPlant(options.plantId);
    if (plant) {
      this.setData({ plantId: options.plantId, plantName: plant.name });
    }
  },

  onType(e) {
    this.setData({ 'form.type': constants.CARE_TYPES[e.detail.value] });
  },

  onDate(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  onContent(e) {
    this.setData({ 'form.content': e.detail.value });
  },

  addPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const p = res.tempFiles[0].tempFilePath;
        wx.getFileSystemManager().saveFile({
          tempFilePath: p,
          success: (r) => this.setData({ photo: r.savedFilePath }),
          fail: () => this.setData({ photo: p })
        });
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
    const { plantId, form, photo } = this.data;
    if (!form.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    const record = {
      id: storage.genId('rec'),
      type: form.type,
      date: form.date,
      content: form.content.trim(),
      photo: photo || ''
    };
    storage.addRecord(plantId, record);
    wx.showToast({ title: '已记录', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  }
});
