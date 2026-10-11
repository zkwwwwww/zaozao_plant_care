const { fail, ok, text, day, fileIds, amount, interval, openContext, ensure, owned, plantView } = require('./runtime');

const STATUSES = ['健康', '生长中', '休眠', '状态一般', '需要关注', '生病中'];

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  const name = text(input.name, 40);
  if (!name) return fail('请填写植物名称');

  try {
    await ensure(db, 'plants');
    const now = db.serverDate();
    const data = {
      name,
      variety: text(input.variety, 40),
      status: STATUSES.indexOf(input.status) >= 0 ? input.status : '健康',
      price: amount(input.price),
      purchaseWay: text(input.purchaseWay, 20),
      planting: text(input.planting, 20),
      environmentId: text(input.environmentId, 64),
      location: text(input.location, 40),
      companionStart: day(input.companionStart),
      purchaseDate: day(input.purchaseDate),
      description: text(input.description, 500),
      photos: fileIds(input.photos, 9),
      customWaterInterval: interval(input.customWaterInterval),
      customFertInterval: interval(input.customFertInterval),
      customRepotInterval: interval(input.customRepotInterval),
      updatedAt: now
    };
    if (input.clientId) data.clientId = text(input.clientId, 64);

    let id = text(input.id, 64);
    if (id) {
      const current = await owned(db, 'plants', id, openid);
      if (!current) return fail('植物不存在或已被删除');
      await db.collection('plants').doc(id).update({ data });
    } else if (data.clientId) {
      const existing = await db.collection('plants').where({ _openid: openid, clientId: data.clientId }).limit(1).get();
      if (existing.data.length && !existing.data[0].deleted) {
        id = existing.data[0]._id;
        await db.collection('plants').doc(id).update({ data });
      }
    }
    if (!id) {
      const added = await db.collection('plants').add({
        data: Object.assign({
          _openid: openid,
          memorialized: false,
          deleted: false,
          createdAt: now
        }, data)
      });
      id = added._id;
    }
    const fresh = await db.collection('plants').doc(id).get();
    return ok({ plant: plantView(fresh.data) });
  } catch (error) {
    console.error('savePlant failed');
    return fail('保存植物失败，请稍后重试');
  }
};
