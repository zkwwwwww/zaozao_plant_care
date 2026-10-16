const { cloud, fail, ok, text, day, fileIds, openContext, ensure, owned } = require('./runtime');

const METHODS = ['扦插', '分株', '叶插', '压条', '根插', '嫁接', '播种', '孢子', '组培', '其他'];
const MAX_DEPTH = 32;

function count(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(max, Math.round(number));
}

function seedlingView(doc) {
  return {
    id: doc._id,
    name: doc.name || '',
    method: doc.method || '',
    startDate: doc.startDate || '',
    motherType: doc.motherType || '',
    motherId: doc.motherId || '',
    motherText: doc.motherText || '',
    motherPhotos: doc.motherPhotos || [],
    photos: doc.photos || [],
    plannedCount: doc.plannedCount || 0,
    gridRows: doc.gridRows || 0,
    gridCols: doc.gridCols || 0,
    substrate: doc.substrate || '',
    container: doc.container || '',
    place: doc.place || '',
    note: doc.note || ''
  };
}

// 沿母株链向上走，遇到自己就是环
async function createsCycle(db, openid, selfId, motherId) {
  let current = motherId;
  for (let i = 0; i < MAX_DEPTH && current; i += 1) {
    if (current === selfId) return true;
    const doc = await owned(db, 'seedlings', current, openid);
    if (!doc || doc.motherType !== 'seedling') return false;
    current = doc.motherId;
  }
  return !!current;
}

async function mother(db, openid, input, selfId) {
  const type = input.motherType;
  if (type === 'plant' || type === 'seedling') {
    const id = text(input.motherId, 64);
    const doc = await owned(db, type === 'plant' ? 'plants' : 'seedlings', id, openid);
    if (!doc) return { error: '母株不存在或已被删除' };
    if (type === 'seedling' && selfId && await createsCycle(db, openid, selfId, id)) {
      return { error: '不能选择自己的子代作为母株' };
    }
    return { motherType: type, motherId: id, motherText: '', motherPhotos: [] };
  }
  const motherText = text(input.motherText, 60);
  const motherPhotos = fileIds(input.motherPhotos, 3);
  if (!motherText && !motherPhotos.length) return { motherType: '', motherId: '', motherText: '', motherPhotos: [] };
  return { motherType: 'text', motherId: '', motherText, motherPhotos };
}

async function save(db, openid, input) {
  const name = text(input.name, 40);
  if (!name) return fail('请填写育苗名称');
  if (METHODS.indexOf(input.method) < 0) return fail('请选择繁殖方式');
  const startDate = day(input.startDate);
  if (!startDate) return fail('请选择育苗日期');

  let id = text(input.id, 64);
  if (id && !await owned(db, 'seedlings', id, openid)) return fail('育苗记录不存在或已被删除');
  const motherInfo = await mother(db, openid, input, id);
  if (motherInfo.error) return fail(motherInfo.error);

  const now = db.serverDate();
  const data = Object.assign({
    name,
    method: input.method,
    startDate,
    photos: fileIds(input.photos, 9),
    plannedCount: count(input.plannedCount, 100000),
    gridRows: count(input.gridRows, 99),
    gridCols: count(input.gridCols, 99),
    substrate: text(input.substrate, 20),
    container: text(input.container, 20),
    place: text(input.place, 30),
    note: text(input.note, 500),
    updatedAt: now
  }, motherInfo);

  if (id) {
    await db.collection('seedlings').doc(id).update({ data });
  } else {
    const added = await db.collection('seedlings').add({
      data: Object.assign({ _openid: openid, deleted: false, createdAt: now }, data)
    });
    id = added._id;
  }
  const fresh = await db.collection('seedlings').doc(id).get();
  return ok({ seedling: seedlingView(fresh.data) });
}

async function remove(db, openid, input) {
  const id = text(input.id, 64);
  const doc = await owned(db, 'seedlings', id, openid);
  if (!doc) return fail('育苗记录不存在或已被删除');
  const now = db.serverDate();
  await db.collection('seedlings').where({ _openid: openid, motherType: 'seedling', motherId: id }).update({
    data: { motherType: 'text', motherId: '', motherText: doc.name || '', updatedAt: now }
  });
  await db.collection('seedlings').doc(id).update({ data: { deleted: true, updatedAt: now } });
  const fileList = (doc.photos || []).concat(doc.motherPhotos || []);
  if (fileList.length) {
    try {
      await cloud.deleteFile({ fileList });
    } catch (error) {
      console.error('manageSeedling file cleanup failed');
    }
  }
  return ok();
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const input = event || {};
  try {
    await ensure(ctx.db, 'seedlings');
    if (input.action === 'delete') return await remove(ctx.db, ctx.openid, input);
    return await save(ctx.db, ctx.openid, input);
  } catch (error) {
    console.error('manageSeedling failed');
    return fail(input.action === 'delete' ? '删除育苗失败，请稍后重试' : '保存育苗失败，请稍后重试');
  }
};
