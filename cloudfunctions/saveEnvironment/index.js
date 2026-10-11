const { fail, ok, text, openContext, ensure, owned } = require('./runtime');

function view(doc) {
  return {
    id: doc._id,
    clientId: doc.clientId || '',
    name: doc.name || '',
    lightIntensity: doc.lightIntensity || '',
    lightHours: doc.lightHours || ''
  };
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  const name = text(input.name, 40);
  if (!name) return fail('请填写环境名称');

  try {
    await ensure(db, 'environments');
    const now = db.serverDate();
    const data = {
      name,
      lightIntensity: text(input.lightIntensity, 12),
      lightHours: text(input.lightHours, 12),
      updatedAt: now
    };
    if (input.clientId) data.clientId = text(input.clientId, 64);
    let id = text(input.id, 64);
    if (id) {
      if (!await owned(db, 'environments', id, openid)) return fail('环境不存在或已被删除');
      await db.collection('environments').doc(id).update({ data });
    } else if (data.clientId) {
      const existing = await db.collection('environments').where({ _openid: openid, clientId: data.clientId }).limit(1).get();
      if (existing.data.length && !existing.data[0].deleted) {
        id = existing.data[0]._id;
        await db.collection('environments').doc(id).update({ data });
      }
    }
    if (!id) {
      const added = await db.collection('environments').add({
        data: Object.assign({ _openid: openid, deleted: false, createdAt: now }, data)
      });
      id = added._id;
    }
    const fresh = await db.collection('environments').doc(id).get();
    return ok({ environment: view(fresh.data) });
  } catch (error) {
    console.error('saveEnvironment failed');
    return fail('保存环境失败，请稍后重试');
  }
};
