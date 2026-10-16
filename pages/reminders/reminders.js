// pages/reminders/reminders.js 提醒总览
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const pagination = require('../../utils/pagination');

const CARE_TYPES = [
  { key: 'water', name: '浇水' },
  { key: 'fertilize', name: '施肥' },
  { key: 'prune', name: '修剪' },
  { key: 'repot', name: '换盆' },
  { key: 'pest', name: '防治病虫害' },
  { key: 'measure', name: '测量' }
];

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
    sections: [
      { key: 'care', label: '开始养护' },
      { key: 'reminder', label: '养护提醒' },
      { key: 'records', label: '养护记录' }
    ],
    activeSection: 'care',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'time', label: '按时间' },
      { key: 'plant', label: '按植物' },
      { key: 'type', label: '按类型' }
    ],
    activeView: 'all',
    groups: [],          // 按植物分组
    flatTasks: [],       // 扁平化待办（含逾期）
    timeGroups: [],
    typeGroups: [],
    carePlants: [],
    careRecords: [],
    recordTypes: ['全部类型'].concat(CARE_TYPES.map(item => item.name)),
    recordTypeIndex: 0,
    recordPlants: [{ id: '', name: '全部植物' }],
    recordPlantIndex: 0,
    careFilters: [],
    careFilter: 'all',
    selectedCareCount: 0,
    allCareSelected: false,
    overdueCount: 0,
    careHasMore: false,
    reminderHasMore: false,
    recordHasMore: false,
    busy: false,
    guest: false,
    loading: false,
    loadError: ''
  },

  onShow() {
    const entrySection = wx.getStorageSync('careEntrySection');
    if (entrySection === 'care' || entrySection === 'reminder' || entrySection === 'records') {
      this.setData({ activeSection: entrySection });
      wx.removeStorageSync('careEntrySection');
    }
    if (!account.requireLogin()) {
      this.setData({
        groups: [],
        flatTasks: [],
        timeGroups: [],
        typeGroups: [],
        carePlants: [],
        careRecords: [],
        careFilters: [],
        selectedCareCount: 0,
        allCareSelected: false,
        overdueCount: 0,
        careHasMore: false,
        reminderHasMore: false,
        recordHasMore: false,
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

  switchSection(e) {
    this.setData({ activeSection: e.currentTarget.dataset.key });
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
    const plants = bundle.plants.filter(p => !p.memorialized);
    const carePlants = plants
      .filter(p => p.status !== '死亡')
      .map(p => ({
        id: p.id,
        name: p.name,
        photo: p.photos && p.photos[0] || '',
        sub: p.variety || p.planting || '未填品种',
        tags: p.tags || [],
        environmentId: p.environmentId || ''
      }));
    const careFilters = [{ key: 'all', label: '全部' }]
      .concat(bundle.tags.map(tag => ({ key: 'tag:' + tag.id, label: '#' + tag.name })))
      .concat(bundle.envs.map(env => ({ key: 'env:' + env.id, label: env.name })));
    const careRecords = [];
    bundle.plants.forEach(plant => {
      (plant.records || []).forEach(record => {
        careRecords.push({
          id: record.id,
          key: plant.id + '_' + record.id,
          plantId: plant.id,
          plantName: plant.name,
          photo: plant.photos && plant.photos[0] || '',
          type: record.type,
          date: record.date,
          content: record.content || ''
        });
      });
    });
    careRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const recordPlantIds = {};
    careRecords.forEach(record => { recordPlantIds[record.plantId] = true; });
    const recordPlants = [{ id: '', name: '全部植物' }].concat(
      bundle.plants
        .filter(plant => recordPlantIds[plant.id])
        .map(plant => ({ id: plant.id, name: plant.name }))
    );

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
    this._allCarePlants = carePlants;
    this._filteredCarePlants = carePlants;
    this._allCareRecords = careRecords;
    this._filteredCareRecords = careRecords;
    this._selectedCareIds = {};
    this._plantMeta = {};
    groups.forEach(group => { this._plantMeta[group.id] = group; });
    this.setData({
      loading: false,
      loadError: '',
      overdueCount,
      careFilters,
      careFilter: 'all',
      selectedCareCount: 0,
      allCareSelected: false,
      recordPlants,
      recordTypeIndex: 0,
      recordPlantIndex: 0
    });
    this.renderTaskPage(1);
    this.renderCarePage(1);
    this.renderRecordPage(1);
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
      reminderHasMore: page.hasMore
    });
  },

  renderCarePage(pageNumber) {
    const page = pagination.slice(this._filteredCarePlants, pageNumber);
    const selected = this._selectedCareIds || {};
    this.setData({
      carePlants: page.items.map(item => Object.assign({}, item, { selected: !!selected[item.id] })),
      careHasMore: page.hasMore
    });
  },

  selectCareFilter(e) {
    const key = e.currentTarget.dataset.key;
    this._selectedCareIds = {};
    if (key.indexOf('tag:') === 0) {
      const id = key.slice(4);
      this._filteredCarePlants = this._allCarePlants.filter(item => item.tags.indexOf(id) >= 0);
    } else if (key.indexOf('env:') === 0) {
      const id = key.slice(4);
      this._filteredCarePlants = this._allCarePlants.filter(item => item.environmentId === id);
    } else {
      this._filteredCarePlants = this._allCarePlants;
    }
    this.setData({ careFilter: key, selectedCareCount: 0, allCareSelected: false });
    this.renderCarePage(1);
  },

  toggleCareSelection(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this._selectedCareIds[id]) delete this._selectedCareIds[id];
    else this._selectedCareIds[id] = true;
    const source = (this._filteredCarePlants || []).slice(0, 100);
    this.setData({
      selectedCareCount: Object.keys(this._selectedCareIds).length,
      allCareSelected: source.length > 0 && source.every(item => this._selectedCareIds[item.id]),
      carePlants: this.data.carePlants.map(item =>
        item.id === id ? Object.assign({}, item, { selected: !item.selected }) : item
      )
    });
  },

  selectAllCare() {
    const source = (this._filteredCarePlants || []).slice(0, 100);
    const allSelected = source.length && source.every(item => this._selectedCareIds[item.id]);
    this._selectedCareIds = {};
    if (!allSelected) source.forEach(item => { this._selectedCareIds[item.id] = true; });
    this.setData({
      selectedCareCount: Object.keys(this._selectedCareIds).length,
      allCareSelected: !allSelected && source.length > 0
    });
    this.renderCarePage(Math.max(1, Math.ceil(this.data.carePlants.length / pagination.PAGE_SIZE)));
  },

  renderRecordPage(pageNumber) {
    const page = pagination.slice(this._filteredCareRecords, pageNumber);
    this.setData({ careRecords: page.items, recordHasMore: page.hasMore });
  },

  filterCareRecords() {
    const type = this.data.recordTypeIndex
      ? this.data.recordTypes[this.data.recordTypeIndex]
      : '';
    const plant = this.data.recordPlants[this.data.recordPlantIndex] || { id: '' };
    this._filteredCareRecords = (this._allCareRecords || []).filter(record =>
      (!type || record.type === type) && (!plant.id || record.plantId === plant.id)
    );
    this.renderRecordPage(1);
  },

  onRecordType(e) {
    this.setData({ recordTypeIndex: Number(e.detail.value) });
    this.filterCareRecords();
  },

  onRecordPlant(e) {
    this.setData({ recordPlantIndex: Number(e.detail.value) });
    this.filterCareRecords();
  },

  onReachBottom() {
    if (this.data.activeSection === 'care' && this.data.careHasMore) {
      this.renderCarePage(Math.floor(this.data.carePlants.length / pagination.PAGE_SIZE) + 1);
    } else if (this.data.activeSection === 'reminder' && this.data.reminderHasMore) {
      this.renderTaskPage(Math.floor(this.data.flatTasks.length / pagination.PAGE_SIZE) + 1);
    } else if (this.data.activeSection === 'records' && this.data.recordHasMore) {
      this.renderRecordPage(Math.floor(this.data.careRecords.length / pagination.PAGE_SIZE) + 1);
    }
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
  },

  startCare(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/note-edit/note-edit?plantId=' + encodeURIComponent(id) });
  },

  batchCare() {
    if (this.data.busy) return;
    const targets = (this._allCarePlants || []).filter(item => this._selectedCareIds[item.id]);
    if (!targets.length) {
      wx.showToast({ title: '请先选择植物', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: CARE_TYPES.map(item => item.name),
      success: (res) => {
        const type = CARE_TYPES[res.tapIndex];
        wx.showModal({
          title: '批量' + type.name,
          content: '为已选择的 ' + targets.length + ' 株植物记录今天的' + type.name + '？',
          confirmText: '确认养护',
          confirmColor: '#2e7d5b',
          success: async (modal) => {
            if (!modal.confirm) return;
            this.setData({ busy: true });
            wx.showLoading({ title: '记录中', mask: true });
            try {
              const result = await dataApi.batchCare(targets.map(item => item.id), type.name);
              wx.hideLoading();
              wx.showToast({ title: '已记录 ' + result.saved + ' 株', icon: 'success' });
              this.load();
            } catch (error) {
              wx.hideLoading();
              wx.showToast({ title: error.message || '记录失败，请重试', icon: 'none' });
            } finally {
              this.setData({ busy: false });
            }
          }
        });
      }
    });
  },

  editRecord(e) {
    const { id, plantId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: '/pages/note-edit/note-edit?plantId=' + encodeURIComponent(plantId)
        + '&recordId=' + encodeURIComponent(id)
    });
  }
});
