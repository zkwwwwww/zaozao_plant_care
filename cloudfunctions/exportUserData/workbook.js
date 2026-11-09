const ExcelJS = require('exceljs');

function string(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '');
}

function number(value) {
  if (value === '' || value == null) return null;
  return Number.isFinite(Number(value)) ? Number(value) : string(value);
}

function date(value) {
  const raw = string(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return result.toISOString().slice(0, 10) === raw ? result : raw;
}

function photos(value) { return (Array.isArray(value) ? value : []).map(string).join('\n'); }
function index(rows) { return new Map(rows.map(row => [row.id, row])); }
function name(map, id) { return map.has(id) ? string(map.get(id).name) : id ? '已删除对象（' + string(id) + '）' : ''; }

function addSheet(workbook, title, columns, rows) {
  const sheet = workbook.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(([header, width, numFmt], i) => ({ header, key: 'c' + i, width: width || 20, style: { numFmt: numFmt || 'General' } }));
  rows.forEach(row => sheet.addRow(row));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { name: 'Microsoft YaHei', size: 11, color: { argb: 'FF26352C' } };
    if (rowNumber === 1) {
      row.height = 30;
      row.font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D5B' } }; });
    } else if (rowNumber % 2 === 0) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F6F3' } }; });
    }
  });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
  return sheet;
}

function buildWorkbook(payload) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '植早早';
  workbook.created = new Date(payload.exportedAt);
  const plants = index(payload.plants);
  const environments = index(payload.environments);
  const seedlings = index(payload.seedlings);
  const tags = index(payload.tags);
  const tasks = payload.plants.flatMap(plant => (plant.manualTasks || []).map(task => ({ plant, task })));
  addSheet(workbook, '导出说明', [['项目', 26], ['内容', 84]], [
    ['导出时间（北京时间）', new Date(new Date(payload.exportedAt).getTime() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19)],
    ['植物档案', payload.plants.length], ['养护记录', payload.records.length], ['手动任务（含已完成）', tasks.length],
    ['花费记录', payload.expenses.length], ['育苗记录', payload.seedlings.length], ['环境', payload.environments.length],
    ['标签', payload.tags.length], ['纪念记录', payload.memorials.length],
    ['使用方法', '每张表的第一行可以筛选，金额和日期可排序。植物名称旁保留编号，方便区分同名植物。'],
    ['导出范围', '当前微信账号的未删除数据，包含已纪念植物及其历史记录；不包含账号身份和其他人的数据。'],
    ['照片说明', '照片保留云端引用，不嵌入图片；本表不是照片的离线备份。'],
    ['用途', '用于查阅、整理和留存。修改表格不会改变小程序里的数据，暂不支持从表格恢复数据。']
  ]);
  const d = 'yyyy-mm-dd';
  const money = '#,##0.00';
  addSheet(workbook, '植物档案', [
    ['名称', 24], ['植物编号', 34], ['品种', 24], ['状态', 16], ['价格（元）', 16, money], ['购买途径', 18], ['赠送人', 20],
    ['种植方式', 16], ['环境', 24], ['位置', 24], ['购买日期', 16, d], ['陪伴开始日期', 18, d], ['描述', 44], ['标签', 28],
    ['浇水间隔（天）', 18], ['施肥间隔（天）', 18], ['换盆间隔（天）', 18], ['提前提醒（天）', 18],
    ['是否已纪念', 16], ['纪念类型', 16], ['纪念日期', 16, d], ['上次忽略浇水', 18, d], ['上次忽略施肥', 18, d], ['上次忽略换盆', 18, d], ['照片引用', 54]
  ], payload.plants.map(p => [
    string(p.name), string(p.id), string(p.variety), string(p.status), number(p.price), string(p.purchaseWay), string(p.giftFrom),
    string(p.planting), name(environments, p.environmentId), string(p.location), date(p.purchaseDate), date(p.companionStart), string(p.description),
    (p.tags || []).map(id => name(tags, id)).join('、'), number(p.customWaterInterval) || '按季节', number(p.customFertInterval) || '按季节',
    number(p.customRepotInterval) || '按季节', number(p.reminderAdvanceDays), p.memorialized ? '是' : '否', string(p.memorialType), date(p.memorialDate),
    date((p.reminderIgnores || {}).water), date((p.reminderIgnores || {}).fertilize), date((p.reminderIgnores || {}).repot), photos(p.photos)
  ]));
  addSheet(workbook, '养护记录', [['植物', 24], ['植物编号', 34], ['养护类型', 20], ['日期', 16, d], ['备注', 54], ['照片引用', 54], ['记录编号', 34]],
    payload.records.map(r => [name(plants, r.plantId), string(r.plantId), string(r.type), date(r.date), string(r.content), string(r.photo), string(r.id)]));
  addSheet(workbook, '手动任务', [['植物', 24], ['植物编号', 34], ['任务', 48], ['状态', 16], ['创建日期', 16, d], ['任务编号', 34]],
    tasks.map(({ plant, task }) => [string(plant.name), string(plant.id), string(task.title), task.done ? '已完成' : '待完成', date(task.createdAt), string(task.id)]));
  addSheet(workbook, '花费记录', [['日期', 16, d], ['类别', 20], ['金额（元）', 18, money], ['备注', 54], ['记录编号', 34]],
    payload.expenses.map(e => [date(e.date), string(e.category), number(e.amount), string(e.note), string(e.id)]));
  addSheet(workbook, '育苗记录', [['名称', 24], ['育苗编号', 34], ['繁殖方式', 18], ['开始日期', 16, d], ['母株', 24], ['母株编号', 34],
    ['计划数量', 16], ['网格行数', 16], ['网格列数', 16], ['基质', 22], ['容器', 22], ['位置', 22], ['备注', 48], ['照片引用', 54], ['母株照片引用', 54]],
  payload.seedlings.map(s => [string(s.name), string(s.id), string(s.method), date(s.startDate),
    s.motherType === 'plant' ? name(plants, s.motherId) : s.motherType === 'seedling' ? name(seedlings, s.motherId) : string(s.motherText),
    string(s.motherId), number(s.plannedCount), number(s.gridRows), number(s.gridCols), string(s.substrate), string(s.container), string(s.place), string(s.note), photos(s.photos), photos(s.motherPhotos)]));
  addSheet(workbook, '环境', [['名称', 26], ['光照强度（lux）', 22], ['每日光照（小时）', 22], ['环境编号', 34]],
    payload.environments.map(e => [string(e.name), number(e.lightIntensity), number(e.lightHours), string(e.id)]));
  addSheet(workbook, '标签', [['名称', 26], ['标签编号', 34]], payload.tags.map(t => [string(t.name), string(t.id)]));
  addSheet(workbook, '纪念记录', [['植物', 24], ['植物编号', 34], ['类型', 16], ['日期', 16, d], ['纪念语', 48], ['陪伴时长', 24], ['照片引用', 54], ['记录编号', 34]],
    payload.memorials.map(m => [string(m.name) || name(plants, m.plantId), string(m.plantId), string(m.type), date(m.date), string(m.note), string(m.companion), photos(m.photos), string(m.id)]));
  return workbook;
}

module.exports = { buildWorkbook };
