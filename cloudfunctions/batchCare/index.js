const { fail, ok, text, day, openContext, ensure } = require('./runtime');

const TYPES = ['浇水', '施肥', '修剪', '换盆', '防治病虫害', '测量'];
const MAX_PLANTS = 100;

function chinaToday() {
  const now = new Date(Date.now() + 8 * 3600000);
  return now.toISOString().slice(0, 10);
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  if (TYPES.indexOf(input.type) < 0) return fail('请选择养护类型');
  const ids = [];
  (Array.isArray(input.plantIds) ? input.plantIds : []).forEach(item => {
    const id = text(item, 64);
    if (id && ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) return fail('没有可养护的植物');
  if (ids.length > MAX_PLANTS) return fail('一次最多批量养护 ' + MAX_PLANTS + ' 株');

  try {
    await ensure(db, 'plants');
    await ensure(db, 'care_records');
    const _ = db.command;
    const snap = await db.collection('plants')
      .where({ _openid: openid, _id: _.in(ids), deleted: false, memorialized: false })
      .limit(MAX_PLANTS)
      .get();
    const targets = snap.data.filter(plant => plant.status !== '死亡');
    if (!targets.length) return fail('没有可养护的植物');

    const date = day(input.date) || chinaToday();
    const now = db.serverDate();
    const rows = targets.map(plant => ({
      _openid: openid,
      plantId: plant._id,
      type: input.type,
      date,
      content: targets.length > 1 ? '批量养护' : '',
      photo: '',
      deleted: false,
      createdAt: now,
      updatedAt: now
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 10) {
      const results = await Promise.all(rows.slice(i, i + 10).map(row =>
        db.collection('care_records').add({ data: row }).then(() => true, () => false)
      ));
      saved += results.filter(Boolean).length;
    }
    if (!saved) return fail('批量养护失败，请稍后重试');
    return ok({ saved, skipped: ids.length - saved, date });
  } catch (error) {
    console.error('batchCare failed');
    return fail('批量养护失败，请稍后重试');
  }
};
