// pages/environment-edit/environment-edit.js 新增/编辑环境
const storage = require('../../utils/storage');
const format = require('../../utils/format');

Page({
  data: {
    id: '',
    isEdit: false,
    form: { name: '', lightIntensity: '', lightHours: '' }
  },

  onLoad(options) {
    if (options.id) {
      const env = storage.getEnv(options.id);
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

  save() {
    const form = this.data.form;
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写环境名称', icon: 'none' });
      return;
    }
    const env = {
      id: this.data.id || storage.genId('env'),
      name: form.name.trim(),
      lightIntensity: form.lightIntensity.trim(),
      lightHours: form.lightHours.trim(),
      createdAt: this.data.isEdit ? (storage.getEnv(this.data.id) || {}).createdAt || format.today() : format.today()
    };
    storage.saveEnv(env);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },

  deleteEnv() {
    if (!this.data.isEdit) return;
    const env = storage.getEnv(this.data.id);
    if (!env) return;
    const used = storage.getPlants().filter(p => p.environmentId === env.id && !p.memorialized).length;
    wx.showModal({
      title: '删除环境',
      content: used > 0 ? '该环境下有 ' + used + ' 株植物，删除后这些植物会变为未分类。确定删除「' + env.name + '」吗？' : '确定删除「' + env.name + '」吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: (res) => {
        if (!res.confirm) return;
        // 将相关植物置为未分类
        const plants = storage.getPlants();
        plants.forEach(p => {
          if (p.environmentId === env.id) {
            p.environmentId = '';
            storage.savePlant(p);
          }
        });
        storage.deleteEnv(env.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 400);
      }
    });
  }
});
