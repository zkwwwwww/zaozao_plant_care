// pages/plant-edit/plant-edit.js 新增 / 编辑植物
const account = require('../../services/account');
const dataApi = require('../../services/data');
const reminder = require('../../utils/reminder');
const constants = require('../../utils/constants');
const media = require('../../utils/media');

Page({
  data: {
    id: '',
    isEdit: false,
    form: {
      name: '',
      variety: '',
      status: '健康',
      price: '',
      purchaseWay: '线上网店',
      planting: '土培',
      environmentId: '',
      location: '',
      companionStart: '',
      purchaseDate: '',
      description: '',
      customWaterInterval: '',
      customFertInterval: '',
      customRepotInterval: ''
    },
    photos: [],
    envs: [],
    envIndex: 0,
    envName: '',
    statusIndex: 0,
    plantingIndex: 0,
    purchaseIndex: 0,
    isSavingPhoto: false,
    isSubmitting: false,
    statusOptions: constants.STATUS_OPTIONS,
    plantingOptions: constants.PLANTING_OPTIONS,
    purchaseOptions: constants.PURCHASE_OPTIONS,
    seasonText: reminder.seasonWaterText()
  },

  async onLoad(options) {
    if (!account.requireLogin()) return;
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      wx.showToast({ title: error.message || '读取失败', icon: 'none' });
      return;
    }
    if (options.id) {
      const plant = bundle.plants.find(item => item.id === options.id);
      if (plant) {
        this.setData({
          id: plant.id,
          isEdit: true,
          form: {
            name: plant.name || '',
            variety: plant.variety || '',
            status: plant.status || '健康',
            price: plant.price !== undefined && plant.price !== '' ? String(plant.price) : '',
            purchaseWay: plant.purchaseWay || '线上网店',
            planting: plant.planting || '土培',
            environmentId: plant.environmentId || '',
            location: plant.location || '',
            companionStart: plant.companionStart || '',
            purchaseDate: plant.purchaseDate || '',
            description: plant.description || '',
            customWaterInterval: plant.customWaterInterval ? String(plant.customWaterInterval) : '',
            customFertInterval: plant.customFertInterval ? String(plant.customFertInterval) : '',
            customRepotInterval: plant.customRepotInterval ? String(plant.customRepotInterval) : ''
          },
          photos: plant.photos || []
        });
      }
    }
    const envs = bundle.envs;
    let envId = this.data.form.environmentId;
    if (!envId && envs.length) envId = envs[0].id;
    const envIndex = Math.max(0, envs.findIndex(e => e.id === envId));
    this.setData({
      envs,
      envIndex,
      envName: envs[envIndex] ? envs[envIndex].name : '',
      'form.environmentId': envId,
      statusIndex: Math.max(0, constants.STATUS_OPTIONS.indexOf(this.data.form.status)),
      plantingIndex: Math.max(0, constants.PLANTING_OPTIONS.indexOf(this.data.form.planting)),
      purchaseIndex: Math.max(0, constants.PURCHASE_OPTIONS.indexOf(this.data.form.purchaseWay))
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onNumInput(e) {
    const field = e.currentTarget.dataset.field;
    // 只允许数字和小数点
    let v = e.detail.value.replace(/[^\d.]/g, '');
    this.setData({ ['form.' + field]: v });
  },

  onStatus(e) {
    const statusIndex = Number(e.detail.value);
    this.setData({
      statusIndex,
      'form.status': constants.STATUS_OPTIONS[statusIndex]
    });
  },

  onPlanting(e) {
    const plantingIndex = Number(e.detail.value);
    this.setData({
      plantingIndex,
      'form.planting': constants.PLANTING_OPTIONS[plantingIndex]
    });
  },

  onPurchaseWay(e) {
    const purchaseIndex = Number(e.detail.value);
    this.setData({
      purchaseIndex,
      'form.purchaseWay': constants.PURCHASE_OPTIONS[purchaseIndex]
    });
  },

  onEnv(e) {
    const envs = this.data.envs;
    const idx = Number(e.detail.value);
    if (!envs[idx]) return;
    this.setData({
      'form.environmentId': envs[idx].id,
      envIndex: idx,
      envName: envs[idx].name
    });
  },

  onDate(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  // 选择/拍照并持久化图片
  addPhoto() {
    if (this.data.isSavingPhoto || this.data.photos.length >= 9) return;
    wx.chooseMedia({
      count: 9 - this.data.photos.length,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        if (!paths.length) return;
        this.setData({ isSavingPhoto: true });
        wx.showLoading({ title: '保存照片中', mask: true });
        try {
          const result = await media.saveImages(paths);
          if (result.savedPaths.length) {
            this.setData({ photos: this.data.photos.concat(result.savedPaths) });
          }
          if (result.failedCount) {
            wx.showToast({
              title: result.failedCount + ' 张照片保存失败，请重试',
              icon: 'none',
              duration: 2500
            });
          }
        } catch (error) {
          wx.showToast({ title: '照片保存失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ isSavingPhoto: false });
        }
      }
    });
  },

  removePhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.photos.slice();
    photos.splice(idx, 1);
    this.setData({ photos });
  },

  previewPhoto(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({ current, urls: this.data.photos });
  },

  async save() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    if (this.data.isSavingPhoto) {
      wx.showToast({ title: '照片仍在保存，请稍候', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;
    const form = this.data.form;
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写植物名称', icon: 'none' });
      return;
    }
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      const saved = await dataApi.savePlant({
        id: this.data.isEdit ? this.data.id : '',
        name: form.name.trim(),
        variety: form.variety.trim(),
        status: form.status,
        price: form.price === '' ? '' : Number(form.price),
        purchaseWay: form.purchaseWay,
        planting: form.planting,
        environmentId: form.environmentId,
        location: form.location.trim(),
        companionStart: form.companionStart || form.purchaseDate,
        purchaseDate: form.purchaseDate,
        description: form.description.trim(),
        photos: this.data.photos,
        customWaterInterval: form.customWaterInterval === '' ? 0 : Number(form.customWaterInterval),
        customFertInterval: form.customFertInterval === '' ? 0 : Number(form.customFertInterval),
        customRepotInterval: form.customRepotInterval === '' ? 0 : Number(form.customRepotInterval)
      });
      wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success' });
      if (this.data.isEdit) {
        wx.navigateBack();
      } else {
        wx.redirectTo({ url: '/pages/plant-detail/plant-detail?id=' + saved.id });
      }
    } catch (error) {
      this.setData({ isSubmitting: false });
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
