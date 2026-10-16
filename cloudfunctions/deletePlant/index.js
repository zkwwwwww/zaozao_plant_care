const { cloud, fail, ok, text, openContext, ensure, owned } = require('./runtime');

async function listOwned(db, collection, where) {
  const rows = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const page = await db.collection(collection).where(where).skip(skip).limit(100).get();
    rows.push.apply(rows, page.data);
    if (page.data.length < 100) break;
  }
  return rows;
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const plantId = text(event && event.plantId, 64);
  if (!plantId) return fail('缺少植物');

  try {
    await ensure(db, 'plants');
    await ensure(db, 'care_records');
    await ensure(db, 'memorials');
    const plant = await owned(db, 'plants', plantId, openid);
    if (!plant) return fail('植物不存在或已被删除');
    const now = db.serverDate();
    const records = await listOwned(db, 'care_records', { _openid: openid, plantId, deleted: false });
    const memorials = await listOwned(db, 'memorials', { _openid: openid, plantId, deleted: false });
    const transaction = await db.startTransaction();
    try {
      await transaction.collection('plants').doc(plantId).update({ data: { deleted: true, updatedAt: now } });
      for (let i = 0; i < records.length; i += 1) {
        await transaction.collection('care_records').doc(records[i]._id).update({ data: { deleted: true, updatedAt: now } });
      }
      for (let i = 0; i < memorials.length; i += 1) {
        await transaction.collection('memorials').doc(memorials[i]._id).update({ data: { deleted: true, updatedAt: now } });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    try {
      await ensure(db, 'seedlings');
      await db.collection('seedlings').where({ _openid: openid, motherType: 'plant', motherId: plantId }).update({
        data: { motherType: 'text', motherId: '', motherText: plant.name || '', updatedAt: now }
      });
    } catch (error) {
      console.error('deletePlant detach seedlings failed');
    }

    const referenced = {};
    (plant.photos || []).forEach(id => { referenced[id] = true; });
    records.forEach(record => { if (record.photo) referenced[record.photo] = true; });
    const fileList = Object.keys(referenced);
    if (fileList.length) {
      try {
        await cloud.deleteFile({ fileList });
      } catch (error) {
        console.error('deletePlant file cleanup failed');
      }
    }
    return ok();
  } catch (error) {
    console.error('deletePlant failed');
    return fail('删除植物失败，请稍后重试');
  }
};
