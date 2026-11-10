const reminder = require('./reminder');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function buildHeader(view, date) {
  const current = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const account = view || {};
  const status = account.status === 'valid' || account.status === 'expired' ? account.status : 'anonymous';
  const hour = current.getHours();
  const greeting = hour < 6 ? '夜深了，早点休息' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
  const season = reminder.currentSeason(current);
  return {
    greeting,
    dateText: (current.getMonth() + 1) + '月' + current.getDate() + '日 · ' + WEEKDAYS[current.getDay()],
    name: status !== 'anonymous' && account.nickName ? account.nickName : '植物朋友',
    statusText: status === 'valid' ? '已登录' : status === 'expired' ? '登录已过期' : '访客模式',
    statusClass: status === 'valid' ? 'active' : status === 'expired' ? 'expired' : 'guest',
    accountAction: status === 'valid' ? '个人资料' : status === 'expired' ? '重新登录' : '去登录',
    description: status === 'expired' ? '重新登录后，继续照顾自己的小花园。' : '记录生长与养护，让陪伴有迹可循。',
    seasonTitle: season.name + '季养护',
    seasonText: '默认浇水间隔 ' + season.waterInterval + ' 天',
    seasonNote: '单株设置优先'
  };
}

module.exports = { buildHeader };
