// pages/environment-edit/environment-edit.js 新增/编辑环境
const account = require('../../services/account');
const dataApi = require('../../services/data');

Page({
  data: {
    id: '',
    isEdit: false,
    form: { name: '', lightIntensity: '', lightHours: '' }
  },

  async onLoad(options) {
    if (!account.requireLogin()) return;
    if (options.id) {
      let bundle;
      try {
        bundle = await dataApi.loadBundle();
      } catch (error) {
        wx.showToast({ title: error.message || '读取失败', icon: 'none' });
        return;
      }
      const env = bundle.envs.find(item => item.id === options.id);
      if (env) {
        this.setData({
          id: env.id,
          isEdit: true,
          form: {
            name: env.name || '',
            lightIntensity: env.lightIntensity !== undefined ? String(env.lightIntensity) : '',
            lightHours: env.lightHours !== undefined ? String(env.lightHours) : ''
          }
        });
      }
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onNumInput(e) {
    const field = e.currentTarget.dataset.field;
    let v = e.detail.value.replace(/[^\d.]/g, '');
    this.setData({ ['form.' + field]: v });
  },

  async save() {
    if (!account.requireLogin()) return;
    const form = this.data.form;
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写环境名称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await dataApi.saveEnv({
        id: this.data.isEdit ? this.data.id : '',
        name: form.name.trim(),
        lightIntensity: form.lightIntensity.trim(),
        lightHours: form.lightHours.trim()
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  deleteEnv() {
    if (!account.requireLogin()) return;
    if (!this.data.isEdit) return;
    const name = this.data.form.name || '该环境';
    wx.showModal({
      title: '删除环境',
      content: '删除「' + name + '」后，使用该环境的植物会变为未分类。确定吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.deleteEnv(this.data.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          wx.navigateBack();
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});
