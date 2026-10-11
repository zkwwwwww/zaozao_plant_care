// pages/index/index.js 主页：植物图片墙 + 总价统计 + 待办提醒
const storage = require('../../utils/storage');
const format = require('../../utils/format');
const reminder = require('../../utils/reminder');

Page({
  data: {
    plants: [],
    envMap: {},
    stats: { count: 0, totalPrice: 0, waterToday: 0, overdue: 0 },
    tasks: [],           // 全局待办（含逾期），用于顶部展示
    seasonText: ''
  },

  onShow() {
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },

  loadData() {
    const plants = storage.getPlants().filter(p => !p.memorialized);
    const envs = storage.getEnvs();
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
      plants: cardPlants,
      envMap,
      stats: { count: plants.length, totalPrice: totalPrice, waterToday, overdue },
      tasks: tasks.slice(0, 5),
      seasonText: reminder.seasonWaterText()
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plant-detail/plant-detail?id=' + id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/plant-edit/plant-edit' });
  },

  goMemorial() {
    wx.navigateTo({ url: '/pages/memorial/memorial' });
  },

  goReminders() {
    wx.switchTab({ url: '/pages/reminders/reminders' });
  }
});
