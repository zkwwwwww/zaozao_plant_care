// pages/index/index.js 主页：植物图片墙 + 总价统计 + 待办提醒
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const account = require('../../services/account');
const dataApi = require('../../services/data');
const migrate = require('../../services/migrate');
const profile = require('../../utils/profile');

Page({
  data: {
    plants: [],
    envMap: {},
    stats: { count: 0, totalPrice: 0, waterToday: 0, overdue: 0 },
    tasks: [],           // 全局待办（含逾期），用于顶部展示
    seasonText: '',
    loading: false,
    loadError: '',
    pricesVisible: false,
    account: { nickName: '', avatarUrl: '', status: 'anonymous', summary: '未登录' },
    showLoginSheet: false,
    guest: false,
    loginExpired: false,
    loginNickName: '',
    loginAvatar: '',
    loginError: '',
    loginSubmitting: false,
    needPrivacy: false,
    keyboardHeight: 0
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

  onUnload() {
    this._alive = false;
  },

  onShow() {
    this._alive = true;
    const view = account.displaySession();
    if (!account.requireLogin()) {
      if (account.isGuest()) {
        this.setData({
          pricesVisible: false,
          account: view,
          showLoginSheet: false,
          guest: true,
          plants: [],
          tasks: [],
          stats: { count: 0, totalPrice: 0, waterToday: 0, overdue: 0 },
          seasonText: reminder.seasonWaterText()
        });
        return;
      }
      this.setData({
        pricesVisible: false,
        account: view,
        guest: false,
        showLoginSheet: true,
        loginExpired: view.status === 'expired',
        loginNickName: this.data.loginNickName || view.nickName || '',
        loginAvatar: this.data.loginAvatar || view.avatarUrl || '',
        loginError: account.cloudReady() ? '' : '云开发未配置，暂时无法登录'
      });
      return;
    }
    this.setData({
      pricesVisible: false,
      account: view,
      showLoginSheet: false,
      guest: false
    });
    this.loadData();
  },

  onPullDownRefresh() {
    if (account.requireLogin()) this.loadData();
    else wx.stopPullDownRefresh();
  },

  async loadData() {
    this.setData({ loading: true, loadError: '' });
    try {
      await migrate.promptOnce();
      if (!this._alive) return;
      const bundle = await dataApi.loadBundle();
      if (!this._alive) return;
      this.renderBundle(bundle);
    } catch (error) {
      if (!this._alive) return;
      this.setData({ loading: false, loadError: error.message || '读取失败，请下拉重试' });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  renderBundle(bundle) {
    const plants = bundle.plants.filter(p => !p.memorialized);
    const envs = bundle.envs;
    const envMap = {};
    envs.forEach(e => { envMap[e.id] = e; });

    // 计算总价
    let totalPrice = 0;
    plants.forEach(p => {
      totalPrice += Number(p.price) || 0;
    });

    // 汇总待办任务
    let tasks = [];
    plants.forEach(p => {
      reminder.plantTasks(p).forEach(t => {
        tasks.push({ key: p.id + '_' + t.type, plantId: p.id, plantName: p.name, photo: p.photos && p.photos[0] || '', ...t });
      });
    });
    // 排序：逾期在前，再按到期日
    tasks.sort((a, b) => (a.overdue === b.overdue ? a.due.localeCompare(b.due) : a.overdue ? -1 : 1));

    const waterToday = tasks.filter(t => t.type === 'water' && !t.overdue && t.due === format.today()).length;
    const overdue = tasks.filter(t => t.overdue).length;

    // 主页植物卡片：附加展示字段
    const cardPlants = plants.map(p => {
      const env = p.environmentId ? envMap[p.environmentId] : null;
      const waterDue = reminder.nextDueDate(p, 'water');
      const waterInfo = waterDue ? format.dueInfo(waterDue) : null;
      return {
        id: p.id,
        name: p.name,
        variety: p.variety || '',
        status: p.status || '健康',
        price: p.price ? format.money(p.price) : '',
        planting: p.planting || '',
        envName: env ? env.name : (p.location || '未分类'),
        photo: p.photos && p.photos.length ? p.photos[0] : '',
        waterText: waterInfo ? (waterInfo.overdue ? '待浇水·' + waterInfo.text : '下次浇水·' + waterInfo.text) : '',
        waterCls: waterInfo ? waterInfo.cls : ''
      };
    });

    this.setData({
      loading: false,
      loadError: '',
      plants: cardPlants,
      envMap,
      stats: { count: plants.length, totalPrice: format.money(totalPrice), waterToday, overdue },
      tasks: tasks.slice(0, 5),
      seasonText: reminder.seasonWaterText()
    });
  },

  togglePrices() {
    this.setData({ pricesVisible: !this.data.pricesVisible });
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/plant-edit/plant-edit' });
  },

  goMemorial() {
    wx.navigateTo({ url: '/pages/memorial/memorial' });
  },

  goAccount() {
    wx.switchTab({ url: '/pages/account/account' });
  },

  preventMove() {},

  onAgreePrivacy() {
    this.setData({ needPrivacy: false });
  },

  onLoginAvatar(e) {
    const loginAvatar = e.detail && e.detail.avatarUrl;
    if (!loginAvatar) {
      wx.showToast({ title: '未拿到头像，请改用相册', icon: 'none' });
      return;
    }
    this.setData({ loginAvatar, loginError: '' });
  },

  chooseLocalAvatar() {
    const openAlbum = () => {
      const save = (path) => {
        if (this._alive && path) this.setData({ loginAvatar: path, loginError: '' });
      };
      const canceled = (message) => /cancel/i.test(message || '');
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => save(res.tempFilePaths && res.tempFilePaths[0]),
        fail: (error) => {
          const message = (error && error.errMsg) || '';
          if (canceled(message) || !this._alive) return;
          this.showPermissionError(message);
        }
      });
    };
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: openAlbum,
        fail: (error) => this.showPermissionError((error && error.errMsg) || 'requirePrivacyAuthorize:fail')
      });
      return;
    }
    openAlbum();
  },

  showPermissionError(message) {
    const text = String(message || '');
    let loginError = '无法打开相册：' + text;
    if (/privacy|scope is not declared|112|104/i.test(text)) {
      loginError = '公众平台未声明相册和昵称头像的隐私用途，微信已拦截。请先配置用户隐私保护指引。';
    } else if (/auth deny|authorize/i.test(text)) {
      loginError = '相册权限被拒绝，请在微信设置里允许植早早访问相册。';
    }
    if (this._alive) this.setData({ loginError });
  },

  onLoginNickname(e) {
    this.setData({ loginNickName: (e.detail && e.detail.value) || '' });
  },

  onNicknameReview(e) {
    if (e.detail && e.detail.pass === false) {
      this.setData({ loginNickName: '', loginError: '该昵称未通过审核，请重新填写' });
    }
  },

  refuseLogin() {
    account.startGuestBrowsing();
    this.setData({ showLoginSheet: false, guest: true, loginError: '' });
    wx.showToast({ title: '可在「我的」中随时登录', icon: 'none' });
  },

  async allowLogin(e) {
    if (this.data.loginSubmitting) return;
    if (!account.cloudReady()) {
      this.setData({ loginError: '云开发未配置，暂时无法登录', showLoginSheet: true });
      return;
    }
    const formNick = e.detail && e.detail.value ? e.detail.value.nickName : '';
    const loginNickName = profile.normalizeNickName(formNick || this.data.loginNickName);
    if (loginNickName) this.setData({ loginNickName });
    if (!this.data.loginAvatar) {
      wx.showToast({ title: '请先授权头像', icon: 'none' });
      return;
    }
    if (!loginNickName) {
      wx.showToast({ title: '请先授权昵称', icon: 'none' });
      return;
    }
    this.setData({ loginSubmitting: true, loginError: '' });
    wx.showLoading({ title: '登录中', mask: true });
    try {
      await account.login({ nickName: loginNickName, avatarUrl: this.data.loginAvatar });
      if (!this._alive) return;
      account.syncTabBar();
      this.setData({
        showLoginSheet: false,
        guest: false,
        loginSubmitting: false,
        loginError: '',
        account: account.displaySession()
      });
      this.loadData();
      wx.showToast({ title: '已登录', icon: 'success' });
    } catch (error) {
      if (!this._alive) return;
      this.setData({
        showLoginSheet: true,
        loginSubmitting: false,
        loginError: error.message || '登录失败，请重试'
      });
      wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goReminders() {
    wx.switchTab({ url: '/pages/reminders/reminders' });
  },

  goEnvironments() {
    wx.switchTab({ url: '/pages/environments/environments' });
  }
});
