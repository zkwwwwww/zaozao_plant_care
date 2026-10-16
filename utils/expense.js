// 花费统计：日 / 周（周一开始）/ 月 / 年
const format = require('./format');

const MODES = [
  { key: 'day', label: '日', count: 7 },
  { key: 'week', label: '周', count: 8 },
  { key: 'month', label: '月', count: 6 },
  { key: 'year', label: '年', count: 5 }
];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function weekStart(dateStr) {
  const d = format.toDate(dateStr);
  if (!d) return '';
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return format.fmtDate(d);
}

function periodKey(dateStr, mode) {
  if (!dateStr) return '';
  if (mode === 'day') return dateStr;
  if (mode === 'week') return weekStart(dateStr);
  if (mode === 'month') return dateStr.slice(0, 7);
  return dateStr.slice(0, 4);
}

function shiftKey(key, mode, step) {
  if (mode === 'day') return format.addDays(key, step);
  if (mode === 'week') return format.addDays(key, step * 7);
  if (mode === 'month') {
    const parts = key.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1 + step, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  return String(Number(key) + step);
}

function periodLabel(key, mode) {
  if (mode === 'day' || mode === 'week') return key.slice(5).replace('-', '/');
  if (mode === 'month') return Number(key.slice(5)) + '月';
  return key;
}

function cents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

// 最近 count 个周期（含当前）的金额序列，旧在前
function buildSeries(expenses, mode, today, count) {
  const current = periodKey(today || format.today(), mode);
  const total = count || (MODES.find(item => item.key === mode) || MODES[0]).count;
  const keys = [];
  for (let i = total - 1; i >= 0; i -= 1) keys.push(shiftKey(current, mode, -i));
  const sums = {};
  (expenses || []).forEach(item => {
    const key = periodKey(item.date, mode);
    sums[key] = (sums[key] || 0) + cents(item.amount);
  });
  const max = Math.max.apply(null, keys.map(key => sums[key] || 0).concat([0]));
  return keys.map(key => {
    const value = sums[key] || 0;
    return {
      key,
      label: periodLabel(key, mode),
      total: format.money(value / 100),
      percent: max ? Math.max(value ? 4 : 0, Math.round(value / max * 100)) : 0
    };
  });
}

function inPeriod(expenses, mode, key) {
  return (expenses || []).filter(item => periodKey(item.date, mode) === key);
}

function inRange(expenses, start, end) {
  return (expenses || []).filter(item => item.date && item.date >= start && item.date <= end);
}

// 自定义区间：≤31 天按日，≤24 个月按月，否则按年
function rangeUnit(start, end) {
  if (format.diffDays(start, end) + 1 <= 31) return 'day';
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
  return months <= 24 ? 'month' : 'year';
}

function rangeSeries(expenses, start, end) {
  const unit = rangeUnit(start, end);
  const rows = inRange(expenses, start, end);
  const last = periodKey(end, unit);
  const keys = [];
  for (let key = periodKey(start, unit); keys.length < 400; key = shiftKey(key, unit, 1)) {
    keys.push(key);
    if (key === last) break;
  }
  const sums = {};
  rows.forEach(item => {
    const key = periodKey(item.date, unit);
    sums[key] = (sums[key] || 0) + cents(item.amount);
  });
  const max = Math.max.apply(null, keys.map(key => sums[key] || 0).concat([0]));
  const step = Math.ceil(keys.length / 7);
  const series = keys.map((key, index) => {
    const value = sums[key] || 0;
    const visible = index % step === 0;
    return {
      key,
      label: visible ? periodLabel(key, unit) : '',
      total: format.money(value / 100),
      percent: max ? Math.max(value ? 4 : 0, Math.round(value / max * 100)) : 0
    };
  });
  return { unit, series };
}

function sum(expenses) {
  return format.money((expenses || []).reduce((acc, item) => acc + cents(item.amount), 0) / 100);
}

function categoryTotals(expenses, categories) {
  const sums = {};
  (expenses || []).forEach(item => {
    sums[item.category] = (sums[item.category] || 0) + cents(item.amount);
  });
  const max = Math.max.apply(null, Object.keys(sums).map(key => sums[key]).concat([0]));
  return (categories || Object.keys(sums))
    .filter(name => sums[name])
    .map(name => ({
      name,
      total: format.money(sums[name] / 100),
      percent: max ? Math.round(sums[name] / max * 100) : 0
    }));
}

// 价格最高的在养植物；并列时先建档的优先
function mostExpensive(plants) {
  let best = null;
  (plants || []).forEach(plant => {
    if (plant.memorialized || plant.status === '死亡') return;
    const price = cents(plant.price);
    if (price <= 0) return;
    if (!best || price > cents(best.price)) best = plant;
  });
  return best;
}

module.exports = {
  MODES,
  weekStart,
  periodKey,
  shiftKey,
  periodLabel,
  buildSeries,
  inPeriod,
  inRange,
  rangeUnit,
  rangeSeries,
  sum,
  categoryTotals,
  mostExpensive
};
