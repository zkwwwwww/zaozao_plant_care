// pages/reminders/reminders.js 提醒总览
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');

Page({
  data: {
    season: '',
    seasonText: '',
    groups: [],          // 按植物分组
    flatTasks: [],       // 扁平化待办（含逾期）
    overdueCount: 0,
    guest: false,
    loading: false,
    loadError: ''
  },

  onShow() {
    if (!account.requireLogin()) {
      const s = reminder.currentSeason();
      this.setData({
        seasonText: '当前' + s.name + '季 · 默认每 ' + s.waterInterval + ' 天浇水',
        groups: [],
        flatTasks: [],
        overdueCount: 0,
        guest: account.isGuest(),
        loading: false
      });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  async load() {
    this.setData({ loading: true, loadError: '' });
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
      return;
    }
    const s = reminder.currentSeason();
    const plants = bundle.plants.filter(p => !p.memorialized);

    const groups = plants.map(p => {
      const tasks = reminder.plantTasks(p);
      return {
        id: p.id,
        name: p.name,
        photo: p.photos && p.photos[0] || '',
        waterInterval: reminder.waterIntervalFor(p),
        tasks
      };
    }).filter(g => g.tasks.length > 0);

    let flatTasks = [];
    groups.forEach(g => {
      g.tasks.forEach(t => flatTasks.push({ ...t, key: g.id + '_' + t.type, plantId: g.id, plantName: g.name, photo: g.photo }));
    });
    flatTasks.sort((a, b) => (a.overdue === b.overdue ? a.due.localeCompare(b.due) : a.overdue ? -1 : 1));
    const overdueCount = flatTasks.filter(t => t.overdue).length;

    this.setData({
      loading: false,
      loadError: '',
      season: s.name,
      seasonText: '当前' + s.name + '季 · 默认每 ' + s.waterInterval + ' 天浇水',
      groups,
      flatTasks,
      overdueCount
    });
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + id });
  },

  // 完成提醒：跳转到该植物快速记一笔
  completeTask(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    const type = (e.detail && e.detail.type) || e.currentTarget.dataset.type;
    const typeName = { water: '浇水', fertilize: '施肥', repot: '换盆' }[type] || '浇水';
    wx.navigateTo({
      url: '/pages/note-edit/note-edit?plantId=' + encodeURIComponent(id) + '&type=' + encodeURIComponent(typeName)
    });
  }
});
