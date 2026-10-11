// pages/plant-edit/plant-edit.js 新增 / 编辑植物
const storage = require('../../utils/storage');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const constants = require('../../utils/constants');

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
    statusOptions: constants.STATUS_OPTIONS,
    plantingOptions: constants.PLANTING_OPTIONS,
    purchaseOptions: constants.PURCHASE_OPTIONS,
    seasonText: reminder.seasonWaterText()
  },

  onLoad(options) {
    if (options.id) {
      const plant = storage.getPlant(options.id);
      if (plant) {
        this.setData({
          id: plant.id,
          isEdit: true,
          form: {
            name: plant.name || '',
            variety: plant.variety || '',
            status: plant.status || '健康',
            price: plant.price !== undefined ? String(plant.price) : '',
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
    const envs = storage.getEnvs();
    let envId = this.data.form.environmentId;
    if (!envId && envs.length) envId = envs[0].id;
    const envIndex = Math.max(0, envs.findIndex(e => e.id === envId));
    this.setData({
      envs,
      envIndex,
      envName: envs[envIndex] ? envs[envIndex].name : '',
      'form.environmentId': envId
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
    this.setData({ 'form.status': constants.STATUS_OPTIONS[e.detail.value] });
  },

  onPlanting(e) {
    this.setData({ 'form.planting': constants.PLANTING_OPTIONS[e.detail.value] });
  },

  onPurchaseWay(e) {
    this.setData({ 'form.purchaseWay': constants.PURCHASE_OPTIONS[e.detail.value] });
  },

  onEnv(e) {
    const envs = this.data.envs;
    const idx = Number(e.detail.value);
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
    wx.chooseMedia({
      count: 9 - this.data.photos.length,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        // 将临时文件保存到本地缓存，避免重启后丢失
        const saved = [];
        paths.forEach(p => {
          wx.getFileSystemManager().saveFile({
            tempFilePath: p,
            success: (r) => saved.push(r.savedFilePath),
            fail: () => saved.push(p)
          });
        });
        // saveFile 为异步，稍作延迟后统一更新
        setTimeout(() => {
          this.setData({ photos: this.data.photos.concat(saved) });
        }, 300);
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

  save() {
    const form = this.data.form;
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写植物名称', icon: 'none' });
      return;
    }
    const now = format.today();
    const plant = {
      id: this.data.id || storage.genId('plant'),
      name: form.name.trim(),
      variety: form.variety.trim(),
      status: form.status,
      price: form.price === '' ? '' : Number(form.price),
      purchaseWay: form.purchaseWay,
      planting: form.planting,
      environmentId: form.environmentId,
      location: form.location.trim(),
      companionStart: form.companionStart,
      purchaseDate: form.purchaseDate,
      description: form.description.trim(),
      photos: this.data.photos,
      customWaterInterval: form.customWaterInterval === '' ? 0 : Number(form.customWaterInterval),
      customFertInterval: form.customFertInterval === '' ? 0 : Number(form.customFertInterval),
      customRepotInterval: form.customRepotInterval === '' ? 0 : Number(form.customRepotInterval),
      records: this.data.isEdit ? (storage.getPlant(this.data.id) || {}).records || [] : [],
      memorialized: this.data.isEdit ? !!(storage.getPlant(this.data.id) || {}).memorialized : false,
      updatedAt: now,
      createdAt: this.data.isEdit ? (storage.getPlant(this.data.id) || {}).createdAt || now : now
    };

    storage.savePlant(plant);
    wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success' });
    setTimeout(() => {
      if (this.data.isEdit) {
        wx.navigateBack();
      } else {
        wx.redirectTo({ url: '/pages/plant-detail/plant-detail?id=' + plant.id });
      }
    }, 400);
  }
});
