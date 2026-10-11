const { fail, ok, text, day, fileIds, openContext, ensure, owned } = require('./runtime');

const TYPES = ['浇水', '施肥', '修剪', '换盆', '防治病虫害', '测量'];

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  const plantId = text(input.plantId, 64);
  const type = TYPES.indexOf(input.type) >= 0 ? input.type : '';
  const date = day(input.date);
  if (!plantId || !type || !date) return fail('请完整填写养护记录');

  try {
    await ensure(db, 'plants');
    await ensure(db, 'care_records');
    const plant = await owned(db, 'plants', plantId, openid);
    if (!plant) return fail('植物不存在或已被删除');
    if (plant.memorialized) return fail('请先恢复植物再添加记录');

    const now = db.serverDate();
    const photos = fileIds(input.photo ? [input.photo] : input.photos, 1);
    const data = {
      plantId,
      type,
      date,
      content: text(input.content, 500),
      photo: photos[0] || '',
      updatedAt: now
    };
    if (input.clientId) data.clientId = text(input.clientId, 64);
    let id = text(input.id, 64);
    if (id) {
      const current = await owned(db, 'care_records', id, openid);
      if (!current || current.plantId !== plantId) return fail('记录不存在或已被删除');
      await db.collection('care_records').doc(id).update({ data });
    } else if (data.clientId) {
      const existing = await db.collection('care_records').where({ _openid: openid, clientId: data.clientId }).limit(1).get();
      if (existing.data.length && !existing.data[0].deleted) {
        id = existing.data[0]._id;
        await db.collection('care_records').doc(id).update({ data });
      }
    }
    if (!id) {
      const added = await db.collection('care_records').add({
        data: Object.assign({ _openid: openid, deleted: false, createdAt: now }, data)
      });
      id = added._id;
    }
    return ok({
      record: { id, plantId, type, date, content: data.content, photo: data.photo }
    });
  } catch (error) {
    console.error('saveRecord failed');
    return fail('保存记录失败，请稍后重试');
  }
};
