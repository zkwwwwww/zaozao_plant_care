// pages/expense-edit/expense-edit.js 记一笔 / 编辑花费
const account = require('../../services/account');
const dataApi = require('../../services/data');
const constants = require('../../utils/constants');
const format = require('../../utils/format');

Page({
  data: {
    id: '',
    isEdit: false,
    categories: constants.EXPENSE_CATEGORIES,
    form: { date: format.today(), category: '', amount: '', note: '' },
    isSubmitting: false
  },

  async onLoad(options) {
    if (!options.id || !account.requireLogin()) return;
    try {
      const bundle = await dataApi.loadBundle();
      const item = bundle.expenses.find(row => row.id === options.id);
      if (!item) {
        wx.showToast({ title: '记录不存在或已被删除', icon: 'none' });
        return;
      }
      this.setData({
        id: item.id,
        isEdit: true,
        form: { date: item.date, category: item.category, amount: format.money(item.amount), note: item.note }
      });
      wx.setNavigationBarTitle({ title: '编辑花费' });
    } catch (error) {
      wx.showToast({ title: error.message || '读取失败', icon: 'none' });
    }
  },

  onDate(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  pickCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.value });
  },

  onAmount(e) {
    let value = e.detail.value.replace(/[^\d.]/g, '');
    const dot = value.indexOf('.');
    if (dot >= 0) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    this.setData({ 'form.amount': value });
    return value;
  },

  onNote(e) {
    this.setData({ 'form.note': e.detail.value });
  },

  async save() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    if (this.data.isSubmitting) return;
    const form = this.data.form;
    if (!form.date) return wx.showToast({ title: '请选择日期', icon: 'none' });
    if (!form.category) return wx.showToast({ title: '请选择类别', icon: 'none' });
    if (!(Number(form.amount) > 0)) return wx.showToast({ title: '请输入大于 0 的金额', icon: 'none' });
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      await dataApi.saveExpense({
        id: this.data.id,
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
        note: form.note.trim()
      });
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      wx.navigateBack();
    } catch (error) {
      wx.hideLoading();
      this.setData({ isSubmitting: false });
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    }
  },

  remove() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    wx.showModal({
      title: '删除花费',
      content: '删除这笔 ¥' + format.money(this.data.form.amount) + ' 的' + this.data.form.category + '记录？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.deleteExpense(this.data.id);
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          wx.navigateBack();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
        }
      }
    });
  }
});
