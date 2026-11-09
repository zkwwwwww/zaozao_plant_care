const account = require('../../services/account');
const dataApi = require('../../services/data');
const migrate = require('../../services/migrate');
const profile = require('../../utils/profile');
const format = require('../../utils/format');
const notifications = require('../../services/notifications');
const releases = require('../../config/releases');
const exportFile = require('../../services/export-file');

const definePage = require('../../services/page');

definePage({
  data: {
    cloudReady: false,
    loading: true,
    submitting: false,
    authorized: false,
    expired: false,
    nickName: '',
    avatarUrl: '',
    openidMask: '',
    error: '',
    needPrivacy: false,
    canMigrate: false,
    longestCompanion: null,
    updateNoticesEnabled: true,
    currentVersion: releases.current.version,
    exporting: false,
    exportedFile: null
  },

  onLoad() {
    this._alive = true;
    if (wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success: (res) => {
          if (this._alive && res.needAuthorization) this.setData({ needPrivacy: true });
        }
      });
    }
  },

  onAgreePrivacy() {
    this.setData({ needPrivacy: false });
  },

  refresh() {
    this.onShow();
  },

  onUnload() {
    this._alive = false;
  },

  onShow() {
    this._alive = true;
    account.syncTabBar();
    const session = account.getSession();
    const view = account.displaySession();
    const signedOut = account.isSignedOut();
    const next = {
      cloudReady: account.cloudReady(),
      authorized: view.status === 'valid',
      expired: view.status === 'expired',
      openidMask: !signedOut && session ? profile.maskOpenId(session.openid) : '',
      loading: false,
      error: account.cloudReady() ? '' : '云开发未配置，暂时无法登录',
      canMigrate: migrate.needsMigration(),
      updateNoticesEnabled: notifications.updatesEnabled()
    };
    if (signedOut) {
      this._exportedFile = null;
      next.exportedFile = null;
      next.nickName = '';
      next.avatarUrl = '';
      next.longestCompanion = null;
    } else if (view.nickName || view.avatarUrl) {
      if (!this.data.nickName) next.nickName = view.nickName;
      if (!this.data.avatarUrl) next.avatarUrl = view.avatarUrl;
    }
    this.setData(next);
    if (view.status === 'valid') this.loadCompanion();
  },

  async loadCompanion() {
    try {
      const bundle = await dataApi.loadBundle();
      if (!this._alive) return;
      let best = null;
      bundle.plants.forEach((plant) => {
        if (plant.memorialized || plant.status === '死亡') return;
        const start = plant.companionStart || plant.purchaseDate;
        if (!format.toDate(start)) return;
        const days = format.diffDays(start, format.today());
        if (days < 0) return;
        if (!best || days > best.days) {
          best = {
            id: plant.id,
            name: plant.name,
            photo: (plant.photos && plant.photos[0]) || '',
            days
          };
        }
      });
      this.setData({ longestCompanion: best });
    } catch (error) {
      // 陪伴信息失败不打断账号页
    }
  },

  goPlant(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + id });
  },

  goBatchEntry() {
    wx.navigateTo({ url: '/pages/batch-entry/batch-entry' });
  },

  goCareReport() {
    wx.navigateTo({ url: '/pages/care-report/care-report' });
  },

  goSeason() {
    wx.navigateTo({ url: '/pages/season-plants/season-plants' });
  },

  goIdentify() {
    wx.navigateTo({ url: '/pages/plant-identify/plant-identify' });
  },

  goUpdates() {
    wx.navigateTo({ url: '/pages/updates/updates' });
  },

  goAppIntro() { wx.navigateTo({ url: '/pages/share/share' }); },

  onUpdateNotices(e) {
    notifications.setUpdatesEnabled(e.detail.value);
    this.setData({ updateNoticesEnabled: e.detail.value });
  },

  refreshNoticeSettings() {
    this.setData({ updateNoticesEnabled: notifications.updatesEnabled() });
  },

  onHide() {
    this._alive = false;
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl;
    if (!avatarUrl) {
      wx.showToast({ title: '未选择头像', icon: 'none' });
      return;
    }
    this.setData({ avatarUrl });
  },

  onNickname(e) {
    this.setData({ nickName: e.detail.value || '' });
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.data.cloudReady) {
      wx.showToast({ title: '云开发未配置', icon: 'none' });
      return;
    }
    const nickName = profile.normalizeNickName(this.data.nickName);
    if (!nickName) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    this.setData({ submitting: true, error: '' });
    const wasAuthorized = this.data.authorized;
    wx.showLoading({ title: wasAuthorized ? '保存中' : '登录中', mask: true });
    try {
      const session = await account.login({
        nickName,
        avatarUrl: this.data.avatarUrl
      });
      if (!this._alive) return;
      dataApi.invalidateBundle();
      this.setData({
        authorized: true,
        expired: false,
        nickName: session.nickName,
        avatarUrl: session.avatarUrl,
        openidMask: profile.maskOpenId(session.openid),
        error: ''
      });
      if (wasAuthorized) {
        wx.showToast({ title: '已保存', icon: 'success' });
      } else {
        wx.showToast({ title: '已登录', icon: 'success' });
        wx.switchTab({ url: '/pages/index/index' });
      }
    } catch (error) {
      if (!this._alive) return;
      this.setData({ error: error.message || '登录失败，请重试' });
      wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      if (this._alive) this.setData({ submitting: false });
    }
  },

  async exportData() {
    if (!this.data.authorized || this.data.exporting) return;
    this.setData({ exporting: true });
    let payload;
    wx.showLoading({ title: '导出中', mask: true });
    try {
      payload = await dataApi.exportData();
      const file = await exportFile.downloadExport(payload);
      this._exportedFile = file;
      this.setData({ exportedFile: { name: file.name, sheetCount: file.sheetCount, rowCount: file.rowCount } });
      wx.hideLoading();
      await exportFile.openExport(file);
    } catch (error) {
      wx.showToast({ title: error.message || '导出失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ exporting: false });
      if (payload && payload.fileID) dataApi.cleanupExport(payload.fileID).catch(() => {});
    }
  },

  async openExport() {
    if (!this.data.authorized || !this._exportedFile) return;
    try { await exportFile.openExport(this._exportedFile); }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },

  shareExport() {
    if (this.data.authorized && this._exportedFile) exportFile.shareExport(this._exportedFile);
  },

  async migrateLocal() {
    wx.showLoading({ title: '正在迁移', mask: true });
    try {
      await migrate.run();
      if (!this._alive) return;
      this.setData({ canMigrate: migrate.needsMigration() });
      wx.showToast({ title: '迁移完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '迁移失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  signOut() {
    wx.showModal({
      title: '退出登录',
      content: '将清除本机的头像和昵称。云端账号仍绑定当前微信，下次授权登录会恢复。',
      confirmText: '退出',
      confirmColor: '#b34e48',
      success: (res) => {
        if (!res.confirm || !this._alive) return;
        account.signOut();
        dataApi.invalidateBundle();
        account.syncTabBar();
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  }
});
