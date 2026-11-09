const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, loadPage, fakeWx } = require('./helpers/runtime');

function emptyPayload() {
  return { exportedAt: '2026-11-04T00:00:00Z', plants: [], records: [], environments: [], memorials: [], seedlings: [], expenses: [], tags: [] };
}

function cloudFixture() {
  const collections = new Map();
  const failures = new Set();
  const uploads = [];
  const deleted = [];
  let exported;
  const db = {
    command: { neq: value => ({ neq: value }), gt: value => ({ gt: value }) },
    collection: name => ({ where: filter => ({ orderBy: () => ({ limit: limit => ({ get: async () => {
      if (failures.has(name)) throw new Error('network');
      const rows = (collections.get(name) || []).filter(row => row._openid === filter._openid && row.deleted !== true && (!filter._id || row._id > filter._id.gt));
      return { data: rows.sort((a, b) => a._id.localeCompare(b._id)).slice(0, limit) };
    } }) }) }) })
  };
  const cloud = {
    uploadFile: async options => { uploads.push(options); return { fileID: 'cloud://env.bucket/' + options.cloudPath }; },
    getTempFileURL: async () => ({ fileList: [{ tempFileURL: 'https://storage.example/export.xlsx', status: 0 }] }),
    deleteFile: async input => { deleted.push(...input.fileList); }
  };
  const main = loadScript('cloudfunctions/exportUserData/index.js', {
    './runtime': { cloud, openContext: async () => ({ db, openid: 'owner' }), ensure: async () => {}, fail: message => ({ ok: false, message }), ok: data => ({ ok: true, ...data }) },
    './workbook': { buildWorkbook: payload => { exported = payload; return { xlsx: { writeBuffer: async () => Buffer.from('xlsx') } }; } }
  }).exports.main;
  return { main, collections, failures, uploads, deleted, cloud, exported: () => exported };
}

test('cloud export reads beyond 1000 rows, filters owners/deletions and preserves real IDs', async () => {
  const f = cloudFixture();
  const rows = Array.from({ length: 1105 }, (_, i) => ({ _id: 'p' + String(i).padStart(5, '0'), _openid: 'owner', name: '植物', id: 'legacy' }));
  rows.push({ _id: 'other', _openid: 'other' }, { _id: 'removed', _openid: 'owner', deleted: true });
  f.collections.set('plants', rows);
  const result = await f.main();
  assert.equal(result.ok, true);
  assert.equal(result.rowCount, 1105);
  assert.equal(result.sheetCount, 9);
  assert.match(result.fileName, /\.xlsx$/);
  const exported = f.exported();
  assert.equal(exported.plants.length, 1105);
  assert.equal(new Set(exported.plants.map(p => p.id)).size, 1105);
  assert.equal(Object.hasOwn(exported.plants[0], '_openid'), false);
  assert.equal(Object.hasOwn(exported.plants[0], '_id'), false);
  assert.equal(f.uploads.length, 1);
});

test('any export read failure fails the whole export instead of providing a partial file', async () => {
  const f = cloudFixture();
  f.failures.add('expenses');
  assert.equal((await f.main()).ok, false);
  assert.equal(f.uploads.length, 0);
});

test('cleanup accepts only current-owner export files and signing errors clean uploaded files', async () => {
  const f = cloudFixture();
  const exported = await f.main();
  assert.equal((await f.main({ action: 'cleanup', fileID: exported.fileID })).ok, true);
  assert.equal((await f.main({ action: 'cleanup', fileID: 'cloud://env.bucket/exports/other/file.xlsx' })).ok, false);
  assert.equal((await f.main({ action: 'cleanup', fileID: exported.fileID.replace('.xlsx', '/../../plants/p.xlsx') })).ok, false);
  f.cloud.getTempFileURL = async () => ({ fileList: [{ status: -1 }] });
  assert.equal((await f.main()).ok, false);
  assert.equal(f.deleted.length, 2);
});

test('export limit includes embedded manual tasks and never creates an incomplete workbook', async () => {
  const f = cloudFixture();
  f.collections.set('plants', Array.from({ length: 1001 }, (_, i) => ({ _id: 'p' + String(i).padStart(5, '0'), _openid: 'owner', manualTasks: Array(50).fill({ id: 't' }) })));
  const result = await f.main();
  assert.equal(result.ok, false);
  assert.match(result.message, /上限/);
  assert.equal(f.uploads.length, 0);
});

test('Excel workbook round-trip preserves dates, zero prices, names, tasks and formula-like plain text', async t => {
  let ExcelJS;
  try { ExcelJS = require('../cloudfunctions/exportUserData/node_modules/exceljs'); }
  catch (error) { t.skip('Install exportUserData dependencies to run the XLSX round-trip test'); return; }
  const { buildWorkbook } = require('../cloudfunctions/exportUserData/workbook');
  const payload = emptyPayload();
  payload.plants = [{ id: 'p1', name: '=HYPERLINK("http://example.com")', price: 0, purchaseDate: '2026-11-04',
    environmentId: 'e', tags: ['t'], reminderAdvanceDays: 0, manualTasks: [{ id: 'm', title: '观察', createdAt: '2026-11-03', done: false }] },
  { id: 'p2', name: '同名', price: '', memorialized: true }];
  payload.environments = [{ id: 'e', name: '阳台', lightIntensity: '500', lightHours: '3.5' }];
  payload.tags = [{ id: 't', name: '热带' }];
  payload.records = [{ id: 'r', plantId: 'p1', type: '浇水', date: '2026-11-04', content: '+SUM(1,2)' }];
  payload.expenses = [{ id: 'x', date: '2026-11-02', amount: 12.35, category: '肥料' }];
  const bytes = await buildWorkbook(payload).xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  assert.equal(reopened.worksheets.length, 9);
  const plants = reopened.getWorksheet('植物档案');
  assert.equal(plants.getCell('A2').value, payload.plants[0].name);
  assert.equal(plants.getCell('A2').formula, undefined);
  assert.equal(plants.getCell('E2').value, 0);
  assert.equal(plants.getCell('E3').value, null);
  assert.equal(plants.getCell('K2').value.toISOString().slice(0, 10), '2026-11-04');
  assert.equal(plants.getCell('I2').value, '阳台');
  assert.equal(plants.getCell('N2').value, '热带');
  assert.equal(plants.getCell('R2').value, 0);
  assert.equal(plants.views[0].ySplit, 1);
  assert.ok(plants.autoFilter);
  assert.equal(reopened.getWorksheet('养护记录').getCell('E2').value, '+SUM(1,2)');
  assert.equal(reopened.getWorksheet('手动任务').getCell('D2').value, '待完成');
  assert.equal(reopened.getWorksheet('花费记录').getCell('C2').value, 12.35);
  const empty = new ExcelJS.Workbook();
  await empty.xlsx.load(await buildWorkbook(emptyPayload()).xlsx.writeBuffer());
  assert.equal(empty.getWorksheet('植物档案').rowCount, 1);
});

test('download/open workflow rejects old JSON and failed downloads, and opens real XLSX files', async () => {
  let document;
  const wx = { downloadFile: options => options.success({ statusCode: 200, tempFilePath: '/tmp/a.xlsx' }),
    openDocument: options => { document = options; options.success(); } };
  const api = loadScript('services/export-file.js', {}, { wx }).module.exports;
  await assert.rejects(api.downloadExport({ plants: [] }), /尚未更新/);
  const input = { fileID: 'cloud://file', downloadUrl: 'https://storage.example/a.xlsx', fileName: '植物.xlsx' };
  const file = await api.downloadExport(input);
  await api.openExport(file);
  assert.equal(document.fileType, 'xlsx');
  assert.equal(document.showMenu, true);
  wx.downloadFile = options => options.success({ statusCode: 403 });
  await assert.rejects(api.downloadExport(input), /下载失败/);
});

test('account export prevents duplicate submissions and keeps a shareable file when preview fails', async () => {
  const wx = fakeWx();
  const cleaned = [];
  let resolveExport;
  const page = loadPage('pages/account/account.js', {
    '../../services/account': {}, '../../services/migrate': {}, '../../services/notifications': {},
    '../../services/data': { exportData: () => new Promise(resolve => { resolveExport = resolve; }), cleanupExport: async fileID => cleaned.push(fileID) },
    '../../services/export-file': { downloadExport: async () => ({ path: '/tmp/a.xlsx', name: '植物.xlsx', sheetCount: 9, rowCount: 1 }),
      openExport: async () => { throw new Error('preview failed'); } }
  }, wx);
  page.data.authorized = true;
  const pending = page.exportData();
  assert.equal(page.data.exporting, true);
  await page.exportData();
  resolveExport({ fileID: 'cloud://file' });
  await pending;
  assert.equal(page.data.exporting, false);
  assert.equal(page.data.exportedFile.name, '植物.xlsx');
  assert.deepEqual(cleaned, ['cloud://file']);
});
