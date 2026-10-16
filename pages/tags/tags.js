// pages/tags/tags.js 标签管理 + 环境归并为标签
const account = require('../../services/account');
const dataApi = require('../../services/data');
const constants = require('../../utils/constants');
const pagination = require('../../utils/pagination');

Page({
  data: {
    guest: false,
    loading: false,
    loadError: '',
    tags: [],
    untaggedCount: 0,
    envs: [],
    untaggedName: constants.UNTAGGED.name,
    hasMore: false
  },

  onShow() {
    if (!account.isAuthorized()) {
      this.setData({ guest: true });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    try {
      const bundle = await dataApi.loadBundle();
      const active = bundle.plants.filter(plant => !plant.memorialized);
      const tags = bundle.tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        count: active.filter(plant => plant.tags.indexOf(tag.id) >= 0).length
      }));
      const known = bundle.tags.map(tag => tag.id);
      const envs = bundle.envs.map(env => ({
        id: env.id,
        name: env.name,
        count: active.filter(plant => plant.environmentId === env.id).length
      }));
      this._allTags = tags;
      this._allEnvs = envs;
      const tagPage = pagination.slice(tags, 1);
      const envPage = pagination.slice(envs, 1);
      this.setData({
        loading: false,
        tags: tagPage.items,
        envs: envPage.items,
        hasMore: tagPage.hasMore || envPage.hasMore,
        untaggedCount: active.filter(plant => !plant.tags.some(id => known.indexOf(id) >= 0)).length
      });
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
    }
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const next = Math.max(
      Math.floor(this.data.tags.length / pagination.PAGE_SIZE),
      Math.floor(this.data.envs.length / pagination.PAGE_SIZE)
    ) + 1;
    const tagPage = pagination.slice(this._allTags, next);
    const envPage = pagination.slice(this._allEnvs, next);
    this.setData({
      tags: tagPage.items,
      envs: envPage.items,
      hasMore: tagPage.hasMore || envPage.hasMore
    });
  },

  ensureLogin() {
    if (account.requireLogin()) return true;
    account.promptLogin();
    return false;
  },

  editName(title, value, onSave) {
    wx.showModal({
      title,
      editable: true,
      content: value || '',
      placeholderText: '最多 12 个字',
      success: async (res) => {
        const name = (res.content || '').trim();
        if (!res.confirm || !name || name === value) return;
        wx.showLoading({ title: '保存中', mask: true });
        try {
          await onSave(name);
          wx.hideLoading();
          this.load();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '保存失败', icon: 'none' });
        }
      }
    });
  },

  addTag() {
    if (!this.ensureLogin()) return;
    this.editName('新建标签', '', name => dataApi.saveTag({ name }));
  },

  renameTag(e) {
    if (!this.ensureLogin()) return;
    const { id, name } = e.currentTarget.dataset;
    this.editName('重命名标签', name, value => dataApi.saveTag({ id, name: value }));
  },

  deleteTag(e) {
    if (!this.ensureLogin()) return;
    const { id, name, count } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除标签',
      content: '删除「' + name + '」后，' + (count ? count + ' 株植物会去掉这个标签，' : '') + '植物本身不受影响。确定吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.deleteTag(id);
          wx.hideLoading();
          this.load();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  mergeEnv(e) {
    if (!this.ensureLogin()) return;
    const { id, name, count } = e.currentTarget.dataset;
    wx.showModal({
      title: '归并为标签',
      content: '会创建（或复用）标签「' + name + '」，并打到该环境下的 ' + count + ' 株植物上。环境本身保留。',
      confirmText: '归并',
      confirmColor: '#2e7d5b',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '归并中', mask: true });
        try {
          const result = await dataApi.mergeEnvironmentTag(id);
          wx.hideLoading();
          wx.showToast({ title: '已归并 ' + (result.updated || 0) + ' 株', icon: 'none' });
          this.load();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '归并失败', icon: 'none' });
        }
      }
    });
  }
});
