const { fail, ok, text, day, openContext, ensure, owned } = require('./runtime');

const TYPES = ['送人', '去世'];

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  const plantId = text(input.plantId, 64);
  const type = TYPES.indexOf(input.type) >= 0 ? input.type : '';
  const date = day(input.date);
  if (!plantId || !type || !date) return fail('请完整填写纪念信息');

  try {
    await ensure(db, 'plants');
    await ensure(db, 'memorials');
    const plant = await owned(db, 'plants', plantId, openid);
    if (!plant) return fail('植物不存在或已被删除');
    const now = db.serverDate();
    const note = text(input.note, 200);
    const companion = text(input.companion, 40);
    const transaction = await db.startTransaction();
    try {
      await transaction.collection('plants').doc(plantId).update({
        data: { memorialized: true, memorialType: type, memorialDate: date, updatedAt: now }
      });
      const existing = await transaction.collection('memorials').where({
        _openid: openid,
        plantId,
        deleted: false
      }).limit(1).get();
      const memorial = {
        plantId,
        name: plant.name || '',
        photos: plant.photos || [],
        type,
        date,
        note,
        companion,
        updatedAt: now
      };
      if (existing.data.length) {
        await transaction.collection('memorials').doc(existing.data[0]._id).update({ data: memorial });
      } else {
        await transaction.collection('memorials').add({
          data: Object.assign({ _openid: openid, deleted: false, createdAt: now }, memorial)
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    return ok();
  } catch (error) {
    console.error('memorializePlant failed');
    return fail('建立纪念碑失败，请稍后重试');
  }
};
