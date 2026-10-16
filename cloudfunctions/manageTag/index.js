const { fail, ok, text, openContext, ensure, owned } = require('./runtime');

const RESERVED = '未分类';

function tagView(doc) {
  return { id: doc._id, name: doc.name || '' };
}

async function findByName(db, openid, name) {
  const snap = await db.collection('tags').where({ _openid: openid, name, deleted: false }).limit(1).get();
  return snap.data[0] || null;
}

async function save(db, openid, input) {
  const name = text(input.name, 12);
  if (!name) return fail('请填写标签名称');
  if (name === RESERVED) return fail('「未分类」是默认标签，请换个名称');
  const id = text(input.id, 64);
  const same = await findByName(db, openid, name);
  if (same && same._id !== id) return fail('已有同名标签');
  const now = db.serverDate();
  if (id) {
    if (!await owned(db, 'tags', id, openid)) return fail('标签不存在或已被删除');
    await db.collection('tags').doc(id).update({ data: { name, updatedAt: now } });
    return ok({ tag: { id, name } });
  }
  const added = await db.collection('tags').add({
    data: { _openid: openid, name, deleted: false, createdAt: now, updatedAt: now }
  });
  return ok({ tag: { id: added._id, name } });
}

async function remove(db, openid, input) {
  const id = text(input.id, 64);
  if (!await owned(db, 'tags', id, openid)) return fail('标签不存在或已被删除');
  const _ = db.command;
  const now = db.serverDate();
  await db.collection('plants').where({ _openid: openid, tags: id }).update({ data: { tags: _.pull(id), updatedAt: now } });
  await db.collection('tags').doc(id).update({ data: { deleted: true, updatedAt: now } });
  return ok();
}

// 用环境名建同名标签（已有则复用），并打到该环境下所有植物上
async function mergeEnvironment(db, openid, input) {
  const envId = text(input.environmentId, 64);
  const env = await owned(db, 'environments', envId, openid);
  if (!env) return fail('环境不存在或已被删除');
  const name = text(env.name, 12) || '环境';
  if (name === RESERVED) return fail('该环境名与默认标签重名，请先改名');
  let tag = await findByName(db, openid, name);
  const now = db.serverDate();
  if (!tag) {
    const added = await db.collection('tags').add({
      data: { _openid: openid, name, deleted: false, createdAt: now, updatedAt: now }
    });
    tag = { _id: added._id, name };
  }
  const _ = db.command;
  const result = await db.collection('plants').where({ _openid: openid, environmentId: envId, deleted: false }).update({
    data: { tags: _.addToSet(tag._id), updatedAt: now }
  });
  return ok({ tag: tagView(tag), updated: (result.stats && result.stats.updated) || 0 });
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const input = event || {};
  try {
    await ensure(ctx.db, 'tags');
    await ensure(ctx.db, 'plants');
    if (input.action === 'delete') return await remove(ctx.db, ctx.openid, input);
    if (input.action === 'mergeEnvironment') return await mergeEnvironment(ctx.db, ctx.openid, input);
    return await save(ctx.db, ctx.openid, input);
  } catch (error) {
    console.error('manageTag failed');
    return fail('标签操作失败，请稍后重试');
  }
};
