// utils/format.js 日期与格式化工具
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 格式化 YYYY-MM-DD
function fmtDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d.replace(/-/g, '/')) : new Date(d);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

// 今天 YYYY-MM-DD
function today() {
  return fmtDate(new Date());
}

// 字符串日期转 Date（兼容 iOS 需把 - 换成 /）
function toDate(str) {
  if (!str) return null;
  return new Date(String(str).replace(/-/g, '/'));
}

// 两个 YYYY-MM-DD 之间的天数差（b - a）
function diffDays(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// 根据某日期加 N 天，返回 YYYY-MM-DD
function addDays(str, n) {
  const d = toDate(str) || new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

// 陪伴时间：从 startDate 到 today 的时长描述
function companionText(startDate) {
  if (!startDate) return '未设置';
  const days = diffDays(startDate, today());
  if (days < 0) return '尚未开始';
  if (days === 0) return '今天加入';
  if (days < 30) return days + ' 天';
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  if (months < 12) {
    return remDays > 0 ? months + ' 个月 ' + remDays + ' 天' : months + ' 个月';
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? years + ' 年 ' + remMonths + ' 个月' : years + ' 年';
}

// 相对今天的状态文案与类名
// 返回 { text, cls, overdue }
function dueInfo(dueDate) {
  if (!dueDate) return { text: '', cls: 'tag-gray', overdue: false };
  const diff = diffDays(today(), dueDate);
  if (diff > 0) {
    return { text: '逾期 ' + diff + ' 天', cls: 'tag-red', overdue: true };
  } else if (diff === 0) {
    return { text: '今天到期', cls: 'tag-amber', overdue: false };
  } else {
    return { text: '还有 ' + (-diff) + ' 天', cls: 'tag-green', overdue: false };
  }
}

// 金额格式化（保留两位小数，去掉多余的 0）
function money(n) {
  const v = Number(n) || 0;
  const s = v.toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

module.exports = {
  fmtDate,
  today,
  toDate,
  diffDays,
  addDays,
  companionText,
  dueInfo,
  money
};
