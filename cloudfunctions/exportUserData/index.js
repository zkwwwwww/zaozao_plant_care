const crypto = require('crypto');
const { cloud, fail, ok, openContext, ensure } = require('./runtime');
const { buildWorkbook } = require('./workbook');
const MAX_ROWS = 50000;

function folder(openid) { return 'exports/' + crypto.createHash('sha256').update(openid).digest('hex') + '/'; }

async function listOwn(db, collection, openid) {
  await ensure(db, collection);
  const rows = [];
  let cursor = '';
  while (true) {
    const filter = { _openid: openid, deleted: db.command.neq(true) };
    if (cursor) filter._id = db.command.gt(cursor);
    const page = await db.collection(collection).where(filter).orderBy('_id', 'asc').limit(100).get();
    if (rows.length + page.data.length > MAX_ROWS) throw new Error('数据量超过单次导出上限，请联系维护者分批导出');
    page.data.forEach(doc => {
      const copy = Object.assign({}, doc, { id: doc._id });
      delete copy._id;
      delete copy._openid;
      rows.push(copy);
    });
    if (page.data.length < 100) break;
    cursor = page.data[page.data.length - 1]._id;
  }
  return rows;
}

exports.main = async event => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  if (event && event.action === 'cleanup') {
    const fileID = typeof event.fileID === 'string' ? event.fileID : '';
    const path = fileID.replace(/^cloud:\/\/[^/]+\//, '');
    if (!fileID.startsWith('cloud://') || !path.startsWith(folder(ctx.openid)) || !/^[a-f0-9-]+\.xlsx$/.test(path.slice(folder(ctx.openid).length))) return fail('文件无效');
    try { await cloud.deleteFile({ fileList: [fileID] }); return ok(); }
    catch (error) { return fail('清理导出文件失败'); }
  }
  let fileID = '';
  try {
    const [plants, records, environments, memorials, seedlings, expenses, tags] = await Promise.all([
      listOwn(ctx.db, 'plants', ctx.openid),
      listOwn(ctx.db, 'care_records', ctx.openid),
      listOwn(ctx.db, 'environments', ctx.openid),
      listOwn(ctx.db, 'memorials', ctx.openid),
      listOwn(ctx.db, 'seedlings', ctx.openid),
      listOwn(ctx.db, 'expenses', ctx.openid),
      listOwn(ctx.db, 'tags', ctx.openid)
    ]);
    const payload = {
      exportedAt: new Date().toISOString(),
      plants,
      records,
      environments,
      memorials,
      seedlings,
      expenses,
      tags
    };
    const rowCount = plants.length + records.length + environments.length + memorials.length + seedlings.length + expenses.length + tags.length +
      plants.reduce((sum, p) => sum + (p.manualTasks || []).length, 0);
    if (rowCount > MAX_ROWS) throw new Error('数据量超过单次导出上限，请联系维护者分批导出');
    const buffer = await buildWorkbook(payload).xlsx.writeBuffer();
    const token = crypto.randomBytes(16).toString('hex');
    const uploaded = await cloud.uploadFile({ cloudPath: folder(ctx.openid) + token + '.xlsx', fileContent: buffer });
    fileID = uploaded.fileID;
    const links = await cloud.getTempFileURL({ fileList: [{ fileID, maxAge: 600 }] });
    const link = links.fileList && links.fileList[0];
    if (!link || !link.tempFileURL || link.status && link.status !== 0) throw new Error('无法下载导出文件');
    const exportDate = new Date(Date.now() + 8 * 3600000).toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    return ok({ fileID, downloadUrl: link.tempFileURL, fileName: '植早早_' + exportDate + '.xlsx', exportedAt: payload.exportedAt,
      sheetCount: 9, rowCount });
  } catch (error) {
    if (fileID) { try { await cloud.deleteFile({ fileList: [fileID] }); } catch (cleanupError) { /* Expired export objects can be removed by a storage lifecycle rule. */ } }
    console.error('exportUserData failed');
    return fail(error.message === '数据量超过单次导出上限，请联系维护者分批导出' ? error.message : '导出失败，请稍后重试');
  }
};
