// pages/reminders/reminders.js 提醒总览
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const pagination = require('../../utils/pagination');

function buildTimeGroups(tasks) {
  const today = format.today();
  const definitions = [
    { key: 'overdue-long', label: '逾期 7 天以上', match: days => days <= -7 },
    { key: 'overdue-recent', label: '逾期 1–6 天', match: days => days < 0 && days > -7 },
    { key: 'today', label: '今天到期', match: days => days === 0 },
    { key: 'tomorrow', label: '明天到期', match: days => days === 1 },
    { key: 'future', label: '之后到期', match: days => days > 1 }
  ];
  return definitions.map(group => Object.assign({}, group, {
    items: tasks.filter(task => group.match(format.diffDays(today, task.due)))
  })).filter(group => group.items.length);
}

function buildTypeGroups(tasks) {
  return [
    { type: 'water', label: '浇水' },
    { type: 'fertilize', label: '施肥' },
    { type: 'repot', label: '换盆' }
  ].map(group => Object.assign({}, group, {
    items: tasks.filter(task => task.type === group.type)
  })).filter(group => group.items.length);
}

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'time', label: '按时间' },
      { key: 'plant', label: '按植物' },
      { key: 'type', label: '按类型' }
    ],
    activeView: 'all',
    season: '',
    seasonText: '',
    groups: [],          // 按植物分组
    flatTasks: [],       // 扁平化待办（含逾期）
    timeGroups: [],
    typeGroups: [],
    overdueCount: 0,
    hasMore: false,
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
        timeGroups: [],
        typeGroups: [],
        overdueCount: 0,
        hasMore: false,
        guest: account.isGuest(),
        loading: false
      });
      return;
    }
    this.setData({ guest: false });
    this.load();
  },

  switchView(e) {
    this.setData({ activeView: e.currentTarget.dataset.key });
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
        advanceDays: reminder.reminderAdvanceDaysFor(p),
        tasks
      };
    }).filter(g => g.tasks.length > 0);

    let flatTasks = [];
    groups.forEach(g => {
      g.tasks.forEach(t => flatTasks.push({ ...t, key: g.id + '_' + t.type, plantId: g.id, plantName: g.name, photo: g.photo }));
    });
    flatTasks.sort((a, b) => (a.overdue === b.overdue ? a.due.localeCompare(b.due) : a.overdue ? -1 : 1));
    const overdueCount = flatTasks.filter(t => t.overdue).length;

    this._allTasks = flatTasks;
    this._plantMeta = {};
    groups.forEach(group => { this._plantMeta[group.id] = group; });
    this.setData({
      loading: false,
      loadError: '',
      season: s.name,
      seasonText: '当前' + s.name + '季 · 默认每 ' + s.waterInterval + ' 天浇水',
      overdueCount
    });
    this.renderTaskPage(1);
  },

  renderTaskPage(pageNumber) {
    const page = pagination.slice(this._allTasks, pageNumber);
    const byPlant = {};
    page.items.forEach(task => {
      if (!byPlant[task.plantId]) {
        const meta = this._plantMeta[task.plantId];
        byPlant[task.plantId] = Object.assign({}, meta, { tasks: [] });
      }
      byPlant[task.plantId].tasks.push(task);
    });
    this.setData({
      flatTasks: page.items,
      groups: Object.keys(byPlant).map(id => byPlant[id]),
      timeGroups: buildTimeGroups(page.items),
      typeGroups: buildTypeGroups(page.items),
      hasMore: page.hasMore
    });
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const next = Math.floor(this.data.flatTasks.length / pagination.PAGE_SIZE) + 1;
    this.renderTaskPage(next);
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
