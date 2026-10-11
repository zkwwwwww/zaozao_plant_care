const { fail, ok, openContext, ensure } = require('./runtime');

async function listOwn(db, collection, openid) {
  await ensure(db, collection);
  const rows = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    let page;
    try {
      page = await db.collection(collection).where({ _openid: openid, deleted: false }).skip(skip).limit(100).get();
    } catch (error) {
      return rows;
    }
    page.data.forEach(doc => {
      const copy = Object.assign({ id: doc._id }, doc);
      delete copy._id;
      delete copy._openid;
      rows.push(copy);
    });
    if (page.data.length < 100) break;
  }
  return rows;
}

exports.main = async () => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  try {
    const [plants, records, environments, memorials] = await Promise.all([
      listOwn(ctx.db, 'plants', ctx.openid),
      listOwn(ctx.db, 'care_records', ctx.openid),
      listOwn(ctx.db, 'environments', ctx.openid),
      listOwn(ctx.db, 'memorials', ctx.openid)
    ]);
    return ok({
      exportedAt: new Date().toISOString(),
      plants,
      records,
      environments,
      memorials
    });
  } catch (error) {
    console.error('exportUserData failed');
    return fail('导出失败，请稍后重试');
  }
};
