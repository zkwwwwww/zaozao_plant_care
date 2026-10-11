const { fail, ok, text, openContext, ensure, owned } = require('./runtime');

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const plantId = text(event && event.plantId, 64);
  if (!plantId) return fail('缺少植物');

  try {
    await ensure(db, 'plants');
    await ensure(db, 'memorials');
    const plant = await owned(db, 'plants', plantId, openid);
    if (!plant) return fail('植物不存在或已被删除');
    const now = db.serverDate();
    const _ = db.command;
    const transaction = await db.startTransaction();
    try {
      await transaction.collection('plants').doc(plantId).update({
        data: {
          memorialized: false,
          memorialType: _.remove(),
          memorialDate: _.remove(),
          updatedAt: now
        }
      });
      const memorials = await transaction.collection('memorials').where({
        _openid: openid,
        plantId,
        deleted: false
      }).limit(20).get();
      for (let i = 0; i < memorials.data.length; i += 1) {
        await transaction.collection('memorials').doc(memorials.data[i]._id).update({
          data: { deleted: true, updatedAt: now }
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    return ok();
  } catch (error) {
    console.error('restorePlant failed');
    return fail('恢复植物失败，请稍后重试');
  }
};
