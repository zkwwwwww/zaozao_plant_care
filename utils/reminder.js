// utils/reminder.js 季节浇水频率 + 施肥/换盆提醒
// 用户规则：春、秋每10天浇一次水；夏每5天；冬每15天。也可为每株植物单独设置间隔。
const format = require('./format');
const UPCOMING_WINDOW_DAYS = 14;

const SEASONS = [
  { key: 'spring', name: '春', months: [3, 4, 5], waterInterval: 10 },
  { key: 'summer', name: '夏', months: [6, 7, 8], waterInterval: 5 },
  { key: 'autumn', name: '秋', months: [9, 10, 11], waterInterval: 10 },
  { key: 'winter', name: '冬', months: [12, 1, 2], waterInterval: 15 }
];

// 当前季节
function currentSeason(date) {
  const d = date || new Date();
  const m = d.getMonth() + 1;
  for (const s of SEASONS) {
    if (s.months.includes(m)) return s;
  }
  return SEASONS[0];
}

// 植物的浇水间隔（天）：优先植物自定义，否则按季节默认
function waterIntervalFor(plant, date) {
  if (plant && plant.customWaterInterval && Number(plant.customWaterInterval) > 0) {
    return Number(plant.customWaterInterval);
  }
  return currentSeason(date).waterInterval;
}

// 施肥间隔：优先自定义，默认 30 天
function fertIntervalFor(plant) {
  if (plant && plant.customFertInterval && Number(plant.customFertInterval) > 0) {
    return Number(plant.customFertInterval);
  }
  return 30;
}

// 换盆间隔：优先自定义，默认 365 天
function repotIntervalFor(plant) {
  if (plant && plant.customRepotInterval && Number(plant.customRepotInterval) > 0) {
    return Number(plant.customRepotInterval);
  }
  return 365;
}

// 从养护记录里取某类型最近一次日期，取不到则回退到 companionStart 或购买日
function lastCareDate(plant, type) {
  const records = (plant.records || []).filter(r => r.type === type && format.toDate(r.date));
  let latest = '';
  for (const r of records) {
    if (r.date && r.date > latest) latest = r.date;
  }
  if (latest) return latest;
  if (format.toDate(plant.companionStart)) return plant.companionStart;
  if (format.toDate(plant.purchaseDate)) return plant.purchaseDate;
  return '';
}

// 某植物某提醒项的下一次日期
// type: 'water' | 'fertilize' | 'repot'
function nextDueDate(plant, type) {
  let last = '', interval = 0;
  if (type === 'water') {
    last = lastCareDate(plant, '浇水');
    interval = waterIntervalFor(plant);
  } else if (type === 'fertilize') {
    last = lastCareDate(plant, '施肥');
    interval = fertIntervalFor(plant);
  } else if (type === 'repot') {
    last = lastCareDate(plant, '换盆');
    interval = repotIntervalFor(plant);
  }
  if (!last) return '';
  return format.addDays(last, interval);
}

// 汇总某植物待办：近期窗口内的未来任务 + 所有逾期任务
function plantTasks(plant, options) {
  const upcomingDays = options && Number.isFinite(Number(options.upcomingDays))
    ? Math.max(0, Number(options.upcomingDays))
    : UPCOMING_WINDOW_DAYS;
  const tasks = [];
  const defs = [
    { type: 'water', label: '浇水', lastType: '浇水' },
    { type: 'fertilize', label: '施肥', lastType: '施肥' },
    { type: 'repot', label: '换盆', lastType: '换盆' }
  ];
  for (const def of defs) {
    const due = nextDueDate(plant, def.type);
    if (!due) continue;
    const info = format.dueInfo(due);
    const daysUntilDue = format.diffDays(format.today(), due);
    if (info.overdue || (daysUntilDue >= 0 && daysUntilDue <= upcomingDays)) {
      tasks.push({
        type: def.type,
        label: def.label,
        due,
        dueText: info.text,
        cls: info.cls,
        overdue: info.overdue
      });
    }
  }
  tasks.sort((a, b) => (a.overdue === b.overdue ? a.due.localeCompare(b.due) : a.overdue ? -1 : 1));
  return tasks;
}

// 当前季节的默认浇水间隔文案
function seasonWaterText() {
  const s = currentSeason();
  return '当前' + s.name + '季，默认每 ' + s.waterInterval + ' 天浇一次水';
}

module.exports = {
  SEASONS,
  UPCOMING_WINDOW_DAYS,
  currentSeason,
  waterIntervalFor,
  fertIntervalFor,
  repotIntervalFor,
  lastCareDate,
  nextDueDate,
  plantTasks,
  seasonWaterText
};
