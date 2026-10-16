// utils/constants.js 全局选项常量
const STATUS_OPTIONS = ['健康', '病害', '虫害', '待观察', '休眠', '死亡'];

// 旧版状态读取时归并到新枚举
const LEGACY_STATUS = {
  生长中: '健康',
  状态一般: '健康',
  需要关注: '待观察',
  生病中: '病害'
};

function normalizeStatus(status) {
  if (STATUS_OPTIONS.indexOf(status) >= 0) return status;
  return LEGACY_STATUS[status] || '健康';
}

function statusClass(status) {
  const value = normalizeStatus(status);
  if (value === '健康') return 'tag-green';
  if (value === '待观察') return 'tag-amber';
  if (value === '休眠') return 'tag-gray';
  return 'tag-red';
}

// 种植形式
const PLANTING_OPTIONS = ['水苔', '土培', '水培', '板植', '颗粒'];

// 养护记录类型
const CARE_TYPES = ['浇水', '施肥', '修剪', '换盆', '防治病虫害', '测量'];

// 购买途径
const PURCHASE_OPTIONS = ['实体花市', '花店', '线上网店', '网购拼团', '朋友赠送', '自己繁育', '其他'];

// 纪念类型
const MEMORIAL_TYPES = ['送人', '去世'];

const PROPAGATION_METHODS = ['扦插', '分株', '叶插', '压条', '根插', '嫁接', '播种', '孢子', '组培', '其他'];
const SUBSTRATE_OPTIONS = ['泥炭+珍珠岩', '珍珠岩', '水苔', '土培', '水培', '半水培', '其他'];
const CONTAINER_OPTIONS = ['穴盘', '塑料圆盆', '塑料四方盆', '其他'];
const EXPENSE_CATEGORIES = ['农资花费', '肥料', '药剂', '补光灯', '其他'];
const DENSITY_OPTIONS = [2, 3, 4, 6];
const UNTAGGED = { id: '__untagged', name: '未分类' };

module.exports = {
  STATUS_OPTIONS,
  LEGACY_STATUS,
  normalizeStatus,
  statusClass,
  PLANTING_OPTIONS,
  CARE_TYPES,
  PURCHASE_OPTIONS,
  MEMORIAL_TYPES,
  PROPAGATION_METHODS,
  SUBSTRATE_OPTIONS,
  CONTAINER_OPTIONS,
  EXPENSE_CATEGORIES,
  DENSITY_OPTIONS,
  UNTAGGED
};
