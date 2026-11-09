const format = require('./format');
const expense = require('./expense');

function metricsFor(bundle, range, today) {
  const prefix = range === 'year' ? today.slice(0, 4) : today.slice(0, 7);
  const inPeriod = date => !!format.toDate(date) && date.indexOf(prefix) === 0 && date <= today;
  const allPlants = bundle.plants || [];
  const active = allPlants.filter(plant => !plant.memorialized && plant.status !== '死亡');
  const counts = new Map();
  let recordCount = 0;
  allPlants.forEach(plant => {
    const count = (plant.records || []).filter(record => inPeriod(record.date)).length;
    counts.set(plant.id, count);
    recordCount += count;
  });
  const top = allPlants.slice().sort((a, b) => counts.get(b.id) - counts.get(a.id))[0];
  let longest = null;
  active.forEach(plant => {
    const start = plant.companionStart || plant.purchaseDate;
    if (!format.toDate(start)) return;
    const days = format.diffDays(start, today);
    if (days >= 0 && (!longest || days > longest.days)) longest = { name: plant.name, days };
  });
  return [
    { label: '当前在养', value: active.length },
    { label: '期间养护次数', value: recordCount },
    { label: '期间其他花费', value: '¥' + expense.sum((bundle.expenses || []).filter(item => inPeriod(item.date))) },
    { label: '期间购入植物', value: allPlants.filter(plant => inPeriod(plant.purchaseDate || plant.companionStart || '')).length },
    { label: '期间新建育苗', value: (bundle.seedlings || []).filter(item => inPeriod(item.startDate)).length },
    { label: '当前病虫害', value: active.filter(plant => ['病害', '虫害'].indexOf(plant.status) >= 0).length },
    { label: '期间养护最多', value: top && counts.get(top.id) > 0 ? top.name : '暂无' },
    { label: '当前陪伴最久', value: longest ? longest.name : '暂无' },
    { label: '最长陪伴天数', value: longest ? longest.days : 0 }
  ];
}

module.exports = { metricsFor };
