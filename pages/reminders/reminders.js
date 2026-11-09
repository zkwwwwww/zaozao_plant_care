// pages/reminders/reminders.js 提醒总览
const account = require('../../services/account');
const dataApi = require('../../services/data');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');
const pagination = require('../../utils/pagination');
const { uniqueId } = require('../../utils/id');
const notifications = require('../../services/notifications');

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
    { key: 'manual', label: '手动待办', match: (days, task) => task.type === 'manual' },
    { key: 'overdue-long', label: '逾期 7 天以上', match: days => days <= -7 },
    { key: 'overdue-recent', label: '逾期 1–6 天', match: days => days < 0 && days > -7 },
    { key: 'today', label: '今天到期', match: days => days === 0 },
    { key: 'tomorrow', label: '明天到期', match: days => days === 1 },
    { key: 'future', label: '之后到期', match: days => days > 1 }
  ];
  return definitions.map(group => Object.assign({}, group, {
    items: tasks.filter(task => group.key === 'manual' ? task.type === 'manual' :
      task.type !== 'manual' && group.match(format.diffDays(today, task.due), task))
  })).filter(group => group.items.length);
}

function buildTypeGroups(tasks) {
  return [
    { type: 'water', label: '浇水' },
    { type: 'fertilize', label: '施肥' },
    { type: 'repot', label: '换盆' },
    { type: 'manual', label: '手动任务' }
  ].map(group => Object.assign({}, group, {
    items: tasks.filter(task => task.type === group.type)
  })).filter(group => group.items.length);
}

const definePage = require('../../services/page');

definePage({
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
    batchSelecting: false,
    selectedTaskCount: 0,
    taskCount: 0,
    batchProgress: '',
    overdueCount: 0,
    careHasMore: false,
    reminderHasMore: false,
    recordHasMore: false,
    busy: false,
    guest: false,
    loading: false,
    loadError: '',
    upcomingWindow: false,
    manualTaskPlants: []
  },

  onShow() {
    if (this.data.busy) return;
    if (wx.getStorageSync('careUpcomingWindow') === 2) {
      this.setData({ upcomingWindow: true });
      wx.removeStorageSync('careUpcomingWindow');
    }
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
        manualTaskPlants: [],
        careFilters: [],
        selectedCareCount: 0,
        allCareSelected: false,
        batchSelecting: false,
        selectedTaskCount: 0,
        taskCount: 0,
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
    if (this.data.busy) return;
    this.setData({ activeView: e.currentTarget.dataset.key });
  },

  switchSection(e) {
    if (this.data.busy) return;
    this.setData({ activeSection: e.currentTarget.dataset.key });
  },

  async load(options) {
    this.setData({ loading: true, loadError: '' });
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '读取失败，请重试' });
      return;
    }
    const plants = bundle.plants.filter(p => !p.memorialized);
    const manualTaskPlants = plants.filter(plant => plant.status !== '死亡').map(plant => ({
      id: plant.id, name: plant.name, count: (plant.manualTasks || []).filter(task => !task.done).length
    })).filter(plant => plant.count);
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
      const tasks = reminder.plantTasks(p, this.data.upcomingWindow ? { upcomingDays: 2 } : undefined).concat(
        p.status === '死亡' ? [] : (p.manualTasks || []).filter(task => !task.done).map(task => ({
          type: 'manual', taskId: task.id, label: task.title, due: '', dueText: '待完成', cls: 'tag-gray', overdue: false
        }))
      );
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
      g.tasks.forEach(t => flatTasks.push({ ...t, key: g.id + '_' + t.type + (t.taskId ? '_' + t.taskId : ''), plantId: g.id, plantName: g.name, photo: g.photo }));
    });
    flatTasks.sort((a, b) => (a.overdue === b.overdue ? (a.due || '9999').localeCompare(b.due || '9999') : a.overdue ? -1 : 1));
    const overdueCount = flatTasks.filter(t => t.overdue).length;

    this._allTasks = flatTasks;
    this._allCarePlants = carePlants;
    this._filteredCarePlants = carePlants;
    this._allCareRecords = careRecords;
    this._filteredCareRecords = careRecords;
    this._selectedCareIds = {};
    const retained = options && options.taskSelection || this._selectedTaskKeys || {};
    this._selectedTaskKeys = {};
    flatTasks.forEach(task => { if (retained[task.key]) this._selectedTaskKeys[task.key] = true; });
    const careRetained = options && options.careSelection || {};
    carePlants.forEach(plant => { if (careRetained[plant.id]) this._selectedCareIds[plant.id] = true; });
    this._plantMeta = {};
    groups.forEach(group => { this._plantMeta[group.id] = group; });
    this.setData({
      loading: false,
      loadError: '',
      overdueCount,
      manualTaskPlants,
      careFilters,
      careFilter: 'all',
      selectedCareCount: Object.keys(this._selectedCareIds).length,
      allCareSelected: false,
      selectedTaskCount: Object.keys(this._selectedTaskKeys).length,
      taskCount: flatTasks.length,
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
    const items = page.items.map(task => Object.assign({}, task, { selected: !!(this._selectedTaskKeys || {})[task.key] }));
    const byPlant = {};
    items.forEach(task => {
      if (!byPlant[task.plantId]) {
        const meta = this._plantMeta[task.plantId];
        byPlant[task.plantId] = Object.assign({}, meta, { tasks: [] });
      }
      byPlant[task.plantId].tasks.push(task);
    });
    this.setData({
      flatTasks: items,
      groups: Object.keys(byPlant).map(id => byPlant[id]),
      timeGroups: buildTimeGroups(items),
      typeGroups: buildTypeGroups(items),
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
    if (this.data.busy) return;
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
    if (this.data.busy) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this._selectedCareIds[id]) delete this._selectedCareIds[id];
    else this._selectedCareIds[id] = true;
    const source = this._filteredCarePlants || [];
    this.setData({
      selectedCareCount: Object.keys(this._selectedCareIds).length,
      allCareSelected: source.length > 0 && source.every(item => this._selectedCareIds[item.id]),
      carePlants: this.data.carePlants.map(item =>
        item.id === id ? Object.assign({}, item, { selected: !item.selected }) : item
      )
    });
  },

  selectAllCare() {
    if (this.data.busy) return;
    const source = this._filteredCarePlants || [];
    const allSelected = source.length && source.every(item => this._selectedCareIds[item.id]);
    this._selectedCareIds = {};
    if (!allSelected) source.forEach(item => { this._selectedCareIds[item.id] = true; });
    this.setData({
      selectedCareCount: Object.keys(this._selectedCareIds).length,
      allCareSelected: !allSelected && source.length > 0
    });
    this.renderCarePage(Math.max(1, Math.ceil(this.data.carePlants.length / pagination.PAGE_SIZE)));
  },

  toggleBatchSelection() {
    if (this.data.busy) return;
    this._selectedTaskKeys = {};
    this.setData({ batchSelecting: !this.data.batchSelecting, selectedTaskCount: 0 });
    this.refreshTaskSelection();
  },

  refreshTaskSelection() {
    this.setData({ selectedTaskCount: Object.keys(this._selectedTaskKeys || {}).length });
    this.renderTaskPage(Math.max(1, Math.ceil(this.data.flatTasks.length / pagination.PAGE_SIZE)));
  },

  toggleTaskSelection(e) {
    if (this.data.busy) return;
    const key = e.detail && e.detail.key || e.currentTarget.dataset.key;
    if (!(this._allTasks || []).some(task => task.key === key)) return;
    this._selectedTaskKeys = this._selectedTaskKeys || {};
    if (this._selectedTaskKeys[key]) delete this._selectedTaskKeys[key];
    else this._selectedTaskKeys[key] = true;
    this.refreshTaskSelection();
  },

  selectTaskScope(e) {
    if (this.data.busy) return;
    const scope = e.currentTarget.dataset.scope;
    this._selectedTaskKeys = {};
    const today = format.today();
    (this._allTasks || []).forEach(task => {
      if (scope === 'all' || scope === 'due' && (task.type === 'manual' || task.due <= today)) this._selectedTaskKeys[task.key] = true;
    });
    this.refreshTaskSelection();
  },

  completeTaskGroup(e) {
    const { type, time, plant } = e.currentTarget.dataset;
    let tasks = this._allTasks || [];
    if (type) tasks = tasks.filter(task => task.type === type);
    if (plant) tasks = tasks.filter(task => task.plantId === plant);
    if (time) tasks = (buildTimeGroups(tasks).find(group => group.key === time) || { items: [] }).items;
    this.confirmBatchTasks(tasks);
  },

  completeSelectedTasks() {
    this.confirmBatchTasks((this._allTasks || []).filter(task => (this._selectedTaskKeys || {})[task.key]));
  },

  confirmBatchTasks(tasks) {
    if (this.data.busy || this.data.loading || this.data.loadError || !tasks.length) return;
    const future = tasks.filter(task => task.due > format.today()).length;
    const counts = {};
    tasks.forEach(task => { const name = reminder.CARE_TYPE_NAME[task.type] || '手动任务'; counts[name] = (counts[name] || 0) + 1; });
    wx.showModal({
      title: '批量完成 ' + tasks.length + ' 项',
      content: Object.keys(counts).map(name => name + ' ' + counts[name] + ' 项').join('、') +
        '。仅在实际完成后确认，养护记录会记在今天。' + (future ? '其中 ' + future + ' 项尚未到期，将提前完成。' : ''),
      confirmText: '确认完成', confirmColor: '#2e7d5b',
      success: res => { if (res.confirm) this.runBatchTasks(tasks); }
    });
  },

  async runBatchTasks(tasks) {
    if (this.data.busy || this.data.loading || this.data.loadError || !tasks.length) return;
    const resumeNotices = notifications.suspend();
    this._taskRequestId = this._taskRequestId || uniqueId('care');
    this._taskRequestDate = this._taskRequestDate || format.today();
    this.setData({ busy: true, batchProgress: '正在处理 0 / ' + tasks.length + ' 项' });
    wx.showLoading({ title: '批量记录中', mask: true });
    try {
      const result = await dataApi.completeCareTasks(tasks, {
        requestId: this._taskRequestId, date: this._taskRequestDate,
        onProgress: progress => this.setData({ batchProgress: '已处理 ' + progress.processed + ' / ' + progress.total + ' 项' })
      });
      const failed = {};
      result.results.forEach(item => { if (item.status === 'failed') failed[item.key] = true; });
      this._selectedTaskKeys = failed;
      if (!result.failed) { this._taskRequestId = ''; this._taskRequestDate = ''; }
      this.setData({ batchSelecting: !!result.failed, selectedTaskCount: result.failed });
      wx.hideLoading();
      await new Promise(resolve => wx.showModal({
        title: result.failed ? '部分事项未完成' : '批量处理完成',
        content: '已完成 ' + result.saved + ' 项' + (result.skipped ? '，' + result.skipped + ' 项已失效，未作更改' : '') +
          (result.failed ? '，' + result.failed + ' 项失败，已保留勾选，可再次点击批量完成重试。' + (result.message || '') : '。'),
        showCancel: false, success: resolve, fail: resolve
      }));
      await this.load({ taskSelection: failed });
    } catch (error) {
      wx.showToast({ title: error.message || '处理失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ busy: false, batchProgress: '' });
      resumeNotices();
    }
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
  async completeTask(e) {
    if (this.data.busy || this.data.loading || this.data.loadError) return;
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    const type = (e.detail && e.detail.type) || e.currentTarget.dataset.type;
    if (type === 'manual') {
      const taskId = e.detail && e.detail.taskId || e.currentTarget.dataset.taskId;
      this.setData({ busy: true });
      try {
        await dataApi.setManualTask(id, taskId, true);
        await this.load();
      } catch (error) {
        wx.showToast({ title: error.message || '完成失败，请重试', icon: 'none' });
      } finally { this.setData({ busy: false }); }
      return;
    }
    const typeName = { water: '浇水', fertilize: '施肥', repot: '换盆' }[type] || '浇水';
    wx.navigateTo({
      url: '/pages/note-edit/note-edit?plantId=' + encodeURIComponent(id) + '&type=' + encodeURIComponent(typeName)
    });
  },

  usePlantWindow() {
    this.setData({ upcomingWindow: false });
    this.load();
  },

  goManualTasks(e) {
    wx.navigateTo({ url: '/pages/manual-tasks/manual-tasks?plantId=' + encodeURIComponent(e.currentTarget.dataset.id) });
  },

  // 一键忽略：延后一个周期，不永久消失
  async ignoreTask(e) {
    if (this.data.busy) return;
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id;
    const type = (e.detail && e.detail.type) || e.currentTarget.dataset.type;
    if (!id || !type) return;
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      wx.showToast({ title: error.message || '读取失败', icon: 'none' });
      return;
    }
    const plant = bundle.plants.find(item => item.id === id);
    if (!plant) {
      wx.showToast({ title: '植物不存在', icon: 'none' });
      return;
    }
    const label = reminder.CARE_TYPE_NAME[type] || type;
    this.setData({ busy: true });
    wx.showLoading({ title: '忽略中', mask: true });
    try {
      await dataApi.ignoreReminder(plant, type);
      wx.showToast({ title: label + '已延后一周期', icon: 'success' });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message || '忽略失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ busy: false });
    }
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除养护记录',
      content: '删除后会按该植物最新记录重算提醒，确定吗？',
      confirmText: '删除',
      confirmColor: '#c0554f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        try {
          await dataApi.deleteRecord(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  startCare(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/note-edit/note-edit?plantId=' + encodeURIComponent(id) });
  },

  batchCare() {
    if (this.data.busy || this.data.loading || this.data.loadError) return;
    const targets = (this._allCarePlants || []).filter(item => this._selectedCareIds[item.id]);
    if (!targets.length) {
      wx.showToast({ title: '请先选择植物', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: CARE_TYPES.map(item => item.name),
      success: (res) => {
        const type = CARE_TYPES[res.tapIndex];
        if (!type) return;
        wx.showModal({
          title: '批量' + type.name,
          content: '为已选择的 ' + targets.length + ' 株植物记录今天的' + type.name + '？',
          confirmText: '确认养护',
          confirmColor: '#2e7d5b',
          success: async (modal) => {
            if (!modal.confirm || this.data.busy || this.data.loading || this.data.loadError) return;
            const resumeNotices = notifications.suspend();
            this.setData({ busy: true });
            this._careRequestId = this._careRequestId || uniqueId('care');
            this._careRequestDate = this._careRequestDate || format.today();
            wx.showLoading({ title: '记录中', mask: true });
            try {
              const result = await dataApi.batchCare(targets.map(item => item.id), type.name, {
                requestId: this._careRequestId, date: this._careRequestDate,
                onProgress: progress => wx.showLoading({ title: progress.processed + '/' + progress.total + ' 株', mask: true })
              });
              wx.hideLoading();
              const failed = {};
              targets.forEach(item => {
                if (result.results.some(row => row.key === item.id + '_' + type.name && row.status === 'failed')) failed[item.id] = true;
              });
              if (!result.failed) { this._careRequestId = ''; this._careRequestDate = ''; }
              await new Promise(resolve => wx.showModal({ title: result.failed ? '部分植物未记录' : '养护已记录', showCancel: false,
                content: '已记录 ' + result.saved + ' 株' + (result.skipped ? '，跳过 ' + result.skipped + ' 株已失效植物' : '') +
                  (result.failed ? '，' + result.failed + ' 株失败，已保留勾选，请重试。' + (result.message || '') : '。'), success: resolve, fail: resolve }));
              await this.load({ careSelection: failed });
            } catch (error) {
              wx.hideLoading();
              wx.showToast({ title: error.message || '记录失败，请重试', icon: 'none' });
            } finally {
              this.setData({ busy: false });
              resumeNotices();
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
