const { fail, ok, text, day, fileIds, amount, interval, openContext, ensure, owned, plantView } = require('./runtime');

const STATUSES = ['健康', '病害', '虫害', '待观察', '休眠', '死亡'];
const LEGACY_STATUS = { 生长中: '健康', 状态一般: '健康', 需要关注: '待观察', 生病中: '病害' };

function status(value) {
  if (STATUSES.indexOf(value) >= 0) return value;
  return LEGACY_STATUS[value] || '健康';
}

function tagIds(list) {
  const source = Array.isArray(list) ? list : [];
  const result = [];
  source.forEach(item => {
    const id = text(item, 64);
    if (id && result.indexOf(id) < 0 && result.length < 20) result.push(id);
  });
  return result;
}

function advanceDays(value) {
  if (value === '' || value == null) return 1;
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(30, Math.max(0, Math.round(number)));
}

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
      status: status(input.status),
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
      reminderAdvanceDays: advanceDays(input.reminderAdvanceDays),
      updatedAt: now
    };
    if (Array.isArray(input.tags)) data.tags = tagIds(input.tags);
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
