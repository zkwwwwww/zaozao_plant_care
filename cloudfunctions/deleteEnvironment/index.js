const { fail, ok, text, openContext, ensure, owned } = require('./runtime');

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const id = text(event && event.id, 64);
  if (!id) return fail('缺少环境');

  try {
    await ensure(db, 'environments');
    await ensure(db, 'plants');
    if (!await owned(db, 'environments', id, openid)) return fail('环境不存在或已被删除');
    const now = db.serverDate();
    const plants = await db.collection('plants').where({ _openid: openid, environmentId: id, deleted: false }).limit(100).get();
    for (let i = 0; i < plants.data.length; i += 1) {
      await db.collection('plants').doc(plants.data[i]._id).update({
        data: { environmentId: '', updatedAt: now }
      });
    }
    await db.collection('environments').doc(id).update({ data: { deleted: true, updatedAt: now } });
    return ok({ unbound: plants.data.length });
  } catch (error) {
    console.error('deleteEnvironment failed');
    return fail('删除环境失败，请稍后重试');
  }
};
