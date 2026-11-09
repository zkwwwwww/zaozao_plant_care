const account = require('../../services/account');
const dataApi = require('../../services/data');
const constants = require('../../utils/constants');
const format = require('../../utils/format');
const media = require('../../utils/media');
const { uniqueId } = require('../../utils/id');

const definePage = require('../../services/page');

definePage({
  data: {
    mode: 'variety',
    baseName: '',
    variety: '',
    count: '3',
    purchaseDate: format.today(),
    planting: '土培',
    plantingIndex: 1,
    plantingOptions: constants.PLANTING_OPTIONS,
    envs: [],
    envIndex: 0,
    envName: '',
    environmentId: '',
    tags: [],
    tagIds: [],
    items: [],
    submitting: false,
    processingPhotos: false,
    savedCount: 0
  },

  async onLoad() {
    if (!account.requireLogin()) return;
    this._draftKey = 'batchDraft:' + account.getSession().openid;
    const draft = wx.getStorageSync(this._draftKey);
    this._modeItems = draft && draft.modeItems ? draft.modeItems : { variety: [], photos: [] };
    if (draft && draft.form) this.setData(draft.form);
    try {
      const bundle = await dataApi.loadBundle();
      const envs = bundle.envs || [];
      this.setData({
        envs,
        envIndex: Math.max(0, envs.findIndex(env => env.id === this.data.environmentId)),
        tags: bundle.tags.map(tag => ({ id: tag.id, name: tag.name, selected: this.data.tagIds.indexOf(tag.id) >= 0 })),
        plantingIndex: Math.max(0, constants.PLANTING_OPTIONS.indexOf('土培'))
      });
      const env = envs[this.data.envIndex];
      this.setData({ envName: env ? env.name : '', environmentId: env ? env.id : '', items: this._modeItems[this.data.mode] || [] });
      if (!this.data.items.length && this.data.mode === 'variety') this.rebuildVariety();
      this.updateSavedCount();
    } catch (error) {
      wx.showToast({ title: error.message || '读取失败', icon: 'none' });
    }
  },

  onHide() { this.saveDraft(); },
  onUnload() { this.saveDraft(); },

  saveDraft() {
    if (!this._draftKey || this._completed) return;
    this._modeItems[this.data.mode] = this.data.items;
    const form = {};
    ['mode', 'baseName', 'variety', 'count', 'purchaseDate', 'planting', 'environmentId', 'tagIds'].forEach(key => { form[key] = this.data[key]; });
    wx.setStorageSync(this._draftKey, { form, modeItems: this._modeItems });
  },

  updateSavedCount() {
    this.setData({ savedCount: this.data.items.filter(item => item.savedId).length });
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode || this.data.submitting || this.data.processingPhotos) return;
    this.saveDraft();
    this.setData({ mode, items: this._modeItems[mode] || [] });
    if (mode === 'variety' && !this.data.items.length) this.rebuildVariety();
    this.updateSavedCount();
  },

  onBaseName(e) { this.setData({ baseName: e.detail.value }); },
  onVariety(e) { this.setData({ variety: e.detail.value }); },
  onCount(e) { this.setData({ count: e.detail.value.replace(/[^\d]/g, '') }); },
  onDate(e) { this.setData({ purchaseDate: e.detail.value }); },
  onPlanting(e) {
    const plantingIndex = Number(e.detail.value);
    this.setData({
      plantingIndex,
      planting: constants.PLANTING_OPTIONS[plantingIndex]
    });
  },
  onEnv(e) {
    const idx = Number(e.detail.value);
    const env = this.data.envs[idx];
    if (!env) return;
    this.setData({ envIndex: idx, envName: env.name, environmentId: env.id });
  },

  toggleTag(e) {
    const id = e.currentTarget.dataset.id;
    const tagIds = this.data.tagIds.slice();
    const index = tagIds.indexOf(id);
    if (index >= 0) tagIds.splice(index, 1);
    else tagIds.push(id);
    this.setData({
      tagIds,
      tags: this.data.tags.map(tag => Object.assign({}, tag, { selected: tagIds.indexOf(tag.id) >= 0 }))
    });
  },

  rebuildVariety() {
    if (this.data.submitting || this.data.processingPhotos) return;
    const count = Math.min(20, Math.max(1, Number(this.data.count) || 1));
    const base = (this.data.baseName || '新植物').trim() || '新植物';
    const apply = () => {
      const items = [];
      for (let i = 0; i < count; i += 1) {
        const previous = this.data.items[i];
        const generatedName = count === 1 ? base : base + ' #' + (i + 1);
        items.push(previous ? Object.assign({}, previous, {
          name: previous.savedId || previous.name !== previous.generatedName ? previous.name : generatedName,
          generatedName
        }) : { key: uniqueId('batch'), name: generatedName, generatedName, photo: '' });
      }
      this.setData({ count: String(count), items });
      this.updateSavedCount();
      this.saveDraft();
    };
    if (count < this.data.items.length) {
      wx.showModal({ title: '减少待录入数量', content: '末尾的草稿将移除，已录入的云端植物不会删除。确定继续吗？', success: res => { if (res.confirm) apply(); } });
    } else apply();
  },

  pickPhotos() {
    if (this.data.submitting || this.data.processingPhotos) return;
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        this.setData({ processingPhotos: true });
        wx.showLoading({ title: '处理照片', mask: true });
        try {
          const base = (this.data.baseName || '新植物').trim() || '新植物';
          const items = [];
          const result = await media.saveImages(res.tempFiles.map(file => file.tempFilePath));
          for (let i = 0; i < result.savedPaths.length; i += 1) {
            const saved = result.savedPaths[i];
            items.push({
              key: uniqueId('batch'),
              name: base + ' #' + (this.data.items.length + i + 1),
              photo: saved
            });
          }
          this.setData({ items: this.data.items.concat(items) });
          this.saveDraft();
          if (result.failedCount) wx.showToast({ title: result.failedCount + ' 张照片失败，其余已保留', icon: 'none' });
        } catch (error) {
          wx.showToast({ title: '照片保存失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ processingPhotos: false });
        }
      }
    });
  },

  pickItemPhoto(e) {
    if (this.data.submitting || this.data.processingPhotos) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.items[index] || this.data.items[index].savedId) return;
    const key = this.data.items[index].key;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        this.setData({ processingPhotos: true });
        try {
          const saved = await media.saveImage(res.tempFiles[0].tempFilePath);
          const position = this.data.items.findIndex(item => item.key === key);
          if (position >= 0) this.setData({ ['items[' + position + '].photo']: saved });
          this.saveDraft();
        } catch (error) {
          wx.showToast({ title: '照片保存失败', icon: 'none' });
        } finally {
          this.setData({ processingPhotos: false });
        }
      }
    });
  },

  onItemName(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ ['items[' + index + '].name']: e.detail.value });
    this.saveDraft();
  },

  removeItem(e) {
    if (this.data.submitting || this.data.processingPhotos) return;
    const index = Number(e.currentTarget.dataset.index);
    const items = this.data.items.slice();
    items.splice(index, 1);
    this.setData({ items });
    this.updateSavedCount();
    this.saveDraft();
  },

  async submit() {
    if (!account.requireLogin()) { account.promptLogin(); return; }
    if (this.data.submitting || this.data.processingPhotos) return;
    const items = this.data.items;
    if (items.some(item => !(item.name || '').trim())) {
      wx.showToast({ title: '请填写每株植物的名称', icon: 'none' });
      return;
    }
    if (!items.length) {
      wx.showToast({ title: '请先生成植株列表', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    this.saveDraft();
    wx.showLoading({ title: '录入中', mask: true });
    let saved = items.filter(item => item.savedId).length;
    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.savedId) continue;
        wx.showLoading({ title: '录入 ' + (saved + 1) + '/' + items.length, mask: true });
        const plant = await dataApi.savePlant({
          clientId: item.key,
          name: item.name.trim(),
          variety: this.data.mode === 'variety' ? this.data.variety.trim() : '',
          status: '健康',
          price: '',
          purchaseWay: '其他',
          giftFrom: '',
          planting: this.data.planting,
          environmentId: this.data.environmentId,
          location: '',
          companionStart: this.data.purchaseDate,
          purchaseDate: this.data.purchaseDate,
          description: '',
          photos: item.photo ? [item.photo] : [],
          tags: this.data.tagIds,
          customWaterInterval: 0,
          customFertInterval: 0,
          customRepotInterval: 0,
          reminderAdvanceDays: 1,
          reminderIgnores: {},
          manualTasks: []
        });
        item.savedId = plant.id;
        item.photo = plant.photos && plant.photos[0] || item.photo;
        saved += 1;
        this.setData({ items, savedCount: saved });
        this.saveDraft();
      }
      wx.showToast({ title: '已添加 ' + saved + ' 株', icon: 'success' });
      this._completed = true;
      wx.removeStorageSync(this._draftKey);
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 500);
    } catch (error) {
      wx.showToast({ title: '已保存 ' + saved + ' 株，重试会继续录入。' + (error.message || ''), icon: 'none', duration: 3000 });
      this.setData({ submitting: false });
    } finally {
      wx.hideLoading();
    }
  }
});
