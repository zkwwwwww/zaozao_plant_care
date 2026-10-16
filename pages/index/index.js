// pages/index/index.js 主页：植物图片墙 + 标签筛选 + 待办聚合
const constants = require('../../utils/constants');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const pagination = require('../../utils/pagination');
const account = require('../../services/account');
const dataApi = require('../../services/data');
const migrate = require('../../services/migrate');
const profile = require('../../utils/profile');

const DENSITY_KEY = 'homeDensity';

Page({
  data: {
    plants: [],
    envMap: {},
    totalPlants: 0,
    visiblePlantCount: 0,
    stats: { count: 0, seedlings: 0, overdue: 0 },
    todo: { total: 0, text: '' },
    todayTasks: [],
    monthlyCare: { total: 0, activeDays: 0, topName: '暂无', overdue: 0 },
    tagBar: [],
    tagFilter: '',
    density: 2,
    hasMore: false,
    loading: false,
    loadError: '',
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
    const density = Number(wx.getStorageSync(DENSITY_KEY));
    if (constants.DENSITY_OPTIONS.indexOf(density) >= 0) this.setData({ density });
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
    if (!account.isAuthorized()) {
      this._bundle = null;
      this.setData({
        account: view,
        showLoginSheet: false,
        guest: true,
        plants: [],
        hasMore: false,
        totalPlants: 0,
        visiblePlantCount: 0,
        tagBar: [],
        tagFilter: '',
        stats: { count: 0, seedlings: 0, overdue: 0 },
        todo: { total: 0, text: '' },
        todayTasks: [],
        monthlyCare: { total: 0, activeDays: 0, topName: '暂无', overdue: 0 }
      });
      return;
    }
    this.setData({
      account: view,
      showLoginSheet: false,
      guest: false
    });
    this.loadData();
  },

  onPullDownRefresh() {
    if (account.requireLogin()) this.loadData(true);
    else wx.stopPullDownRefresh();
  },

  async loadData(force) {
    this.setData({ loading: true, loadError: '' });
    try {
      await migrate.promptOnce();
      if (!this._alive) return;
      const bundle = await dataApi.loadBundle({ force: !!force });
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
    this._bundle = bundle;
    const plants = bundle.plants.filter(p => !p.memorialized);
    const envMap = {};
    bundle.envs.forEach(e => { envMap[e.id] = e; });
    const tagIds = bundle.tags.map(tag => tag.id);
    const groups = reminder.dueTodayGroups(plants);
    const today = format.today();
    const todayGroups = groups.map(group => ({
      label: group.label,
      items: group.items.filter(task => task.due === today)
    }));
    const todayTasks = [];
    todayGroups.forEach(group => group.items.forEach(task => {
      todayTasks.push({
        key: task.plantId + '_' + task.type,
        plantId: task.plantId,
        plantName: task.plantName,
        photo: task.photo || '',
        label: group.label
      });
    }));
    const todaySummary = todayGroups
      .filter(group => group.items.length)
      .map(group => group.label + ' ' + group.items.length)
      .join(' · ');
    if (todayTasks.length) {
      todayTasks.unshift({ key: 'summary', summary: true, text: todaySummary });
    }
    const overdue = groups.reduce((sum, group) => sum + group.items.filter(t => t.overdue).length, 0);
    const monthPrefix = today.slice(0, 7);
    const monthlyRecords = [];
    const careCounts = {};
    bundle.plants.forEach(plant => {
      (plant.records || []).forEach(record => {
        if ((record.date || '').slice(0, 7) !== monthPrefix) return;
        monthlyRecords.push(record);
        careCounts[plant.id] = (careCounts[plant.id] || 0) + 1;
      });
    });
    const topPlantId = Object.keys(careCounts).sort((a, b) => careCounts[b] - careCounts[a])[0];
    const topCarePlant = topPlantId ? bundle.plants.find(plant => plant.id === topPlantId) : null;

    const filter = this.data.tagFilter;
    const validFilter = !filter || filter === constants.UNTAGGED.id || tagIds.indexOf(filter) >= 0 ? filter : '';
    const visible = plants.filter(p => {
      const own = (p.tags || []).filter(id => tagIds.indexOf(id) >= 0);
      if (!validFilter) return true;
      if (validFilter === constants.UNTAGGED.id) return !own.length;
      return own.indexOf(validFilter) >= 0;
    });

    const cardPlants = visible.map(p => {
      const env = p.environmentId ? envMap[p.environmentId] : null;
      const waterDue = p.status === '死亡' ? '' : reminder.nextDueDate(p, 'water');
      const waterInfo = waterDue ? format.dueInfo(waterDue) : null;
      return {
        id: p.id,
        name: p.name,
        variety: p.variety || '',
        status: p.status,
        statusCls: constants.statusClass(p.status),
        planting: p.planting || '',
        envName: env ? env.name : (p.location || '未设置环境'),
        photo: p.photos && p.photos.length ? p.photos[0] : '',
        waterText: waterInfo ? (waterInfo.overdue ? '待浇水·' + waterInfo.text : '下次浇水·' + waterInfo.text) : '',
        waterCls: waterInfo ? waterInfo.cls : ''
      };
    });
    this._visiblePlants = cardPlants;
    const page = pagination.slice(cardPlants, 1);

    this.setData({
      loading: false,
      loadError: '',
      plants: page.items,
      hasMore: page.hasMore,
      totalPlants: plants.length,
      visiblePlantCount: visible.length,
      tagFilter: validFilter,
      tagBar: [{ id: '', name: '全部' }].concat(bundle.tags, [constants.UNTAGGED]),
      envMap,
      stats: { count: plants.length, seedlings: bundle.seedlings.length, overdue },
      todo: {
        total: todayGroups.reduce((sum, group) => sum + group.items.length, 0),
        text: todaySummary
      },
      todayTasks,
      monthlyCare: {
        total: monthlyRecords.length,
        activeDays: Array.from(new Set(monthlyRecords.map(record => record.date))).length,
        topName: topCarePlant ? topCarePlant.name : '暂无',
        overdue
      }
    });
  },

  pickTag(e) {
    this.setData({ tagFilter: e.currentTarget.dataset.id });
    if (this._bundle) this.renderBundle(this._bundle);
  },

  onReachBottom() {
    if (!this.data.hasMore || !this._visiblePlants) return;
    const nextPage = Math.floor(this.data.plants.length / pagination.PAGE_SIZE) + 1;
    const page = pagination.slice(this._visiblePlants, nextPage);
    this.setData({ plants: page.items, hasMore: page.hasMore });
  },

  pickDensity() {
    const options = constants.DENSITY_OPTIONS;
    wx.showActionSheet({
      itemList: options.map(n => '每行 ' + n + ' 个'),
      success: (res) => {
        const density = options[res.tapIndex];
        this.setData({ density });
        wx.setStorageSync(DENSITY_KEY, density);
      }
    });
  },

  goCareReminders() {
    wx.setStorageSync('careEntrySection', 'reminder');
    wx.switchTab({ url: '/pages/reminders/reminders' });
  },

  goTags() {
    wx.navigateTo({ url: '/pages/tags/tags' });
  },

  goSeedlings() {
    wx.navigateTo({ url: '/pages/seedlings/seedlings' });
  },

  goExpenses() {
    wx.navigateTo({ url: '/pages/expenses/expenses' });
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + id });
  },

  goAdd() {
    const tag = this.data.tagFilter;
    wx.navigateTo({ url: '/pages/plant-edit/plant-edit' + (tag ? '?tag=' + tag : '') });
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
      dataApi.invalidateBundle();
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
    wx.setStorageSync('careEntrySection', 'care');
    wx.switchTab({ url: '/pages/reminders/reminders' });
  },

  goCareRecords() {
    wx.setStorageSync('careEntrySection', 'records');
    wx.switchTab({ url: '/pages/reminders/reminders' });
  },

  goEnvironments() {
    wx.switchTab({ url: '/pages/environments/environments' });
  }
});
