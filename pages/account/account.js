const account = require('../../services/account');
const dataApi = require('../../services/data');
const migrate = require('../../services/migrate');
const profile = require('../../utils/profile');

Page({
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
    canMigrate: false
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
      loading: account.cloudReady() && view.status === 'valid',
      error: account.cloudReady() ? '' : '云开发未配置，暂时无法登录',
      canMigrate: migrate.needsMigration()
    };
    if (signedOut) {
      next.nickName = '';
      next.avatarUrl = '';
    } else if (view.nickName || view.avatarUrl) {
      if (!this.data.nickName) next.nickName = view.nickName;
      if (!this.data.avatarUrl) next.avatarUrl = view.avatarUrl;
    }
    this.setData(next);
    if (next.loading) this.refresh();
  },

  onHide() {
    this._alive = false;
  },

  async refresh() {
    try {
      const session = await account.refresh();
      if (!this._alive || !session) return;
      const avatarDirty = this.data.avatarUrl && !profile.isCloudFileId(this.data.avatarUrl);
      this.setData({
        loading: false,
        error: '',
        authorized: profile.sessionStatus(session) === 'valid',
        expired: profile.sessionStatus(session) === 'expired',
        nickName: this.data.nickName || session.nickName,
        avatarUrl: avatarDirty ? this.data.avatarUrl : (session.avatarUrl || this.data.avatarUrl),
        openidMask: profile.maskOpenId(session.openid)
      });
    } catch (error) {
      if (!this._alive) return;
      this.setData({
        loading: false,
        error: error.message || '登录失败，请重试'
      });
    }
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
    if (!this.data.authorized) return;
    wx.showLoading({ title: '导出中', mask: true });
    try {
      const payload = await dataApi.exportData();
      const text = JSON.stringify(payload);
      wx.setClipboardData({
        data: text.length > 100000 ? text.slice(0, 100000) : text,
        success: () => wx.showToast({ title: text.length > 100000 ? '数据较大，已复制前一部分' : '已复制到剪贴板', icon: 'none' })
      });
    } catch (error) {
      wx.showToast({ title: error.message || '导出失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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
        account.syncTabBar();
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  }
});
