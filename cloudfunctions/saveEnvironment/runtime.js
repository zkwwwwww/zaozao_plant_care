const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function fail(message) {
  return { ok: false, message: message || '操作失败，请稍后重试' };
}

function ok(data) {
  return Object.assign({ ok: true }, data || {});
}

function text(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function day(value) {
  const raw = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function fileIds(list, max) {
  const source = Array.isArray(list) ? list : [];
  const result = [];
  for (let i = 0; i < source.length && result.length < max; i += 1) {
    if (typeof source[i] === 'string' && source[i].indexOf('cloud://') === 0) result.push(source[i]);
  }
  return result;
}

function amount(value) {
  if (value === '' || value == null) return '';
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10000000) return '';
  return Math.round(number * 100) / 100;
}

function interval(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 3650) return 0;
  return Math.round(number);
}

async function openContext(requireUser) {
  const openid = cloud.getWXContext().OPENID;
  if (requireUser !== false && !openid) return { error: fail('未获取到微信用户身份') };
  return { openid: openid || '', db: cloud.database() };
}

async function ensure(db, name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    const detail = JSON.stringify(error || {});
    if (!/exist|已存在|ResourceExist|-501001|-502002/i.test(detail)) throw error;
  }
}

async function owned(db, collection, id, openid) {
  if (!id) return null;
  try {
    const snap = await db.collection(collection).doc(String(id)).get();
    const doc = snap.data;
    if (!doc || doc._openid !== openid || doc.deleted) return null;
    return doc;
  } catch (error) {
    return null;
  }
}

function plantView(doc) {
  return {
    id: doc._id,
    clientId: doc.clientId || '',
    name: doc.name || '',
    variety: doc.variety || '',
    status: doc.status || '健康',
    price: doc.price === 0 ? 0 : (doc.price || ''),
    purchaseWay: doc.purchaseWay || '',
    planting: doc.planting || '',
    environmentId: doc.environmentId || '',
    location: doc.location || '',
    companionStart: doc.companionStart || '',
    purchaseDate: doc.purchaseDate || '',
    description: doc.description || '',
    photos: doc.photos || [],
    customWaterInterval: doc.customWaterInterval || 0,
    customFertInterval: doc.customFertInterval || 0,
    customRepotInterval: doc.customRepotInterval || 0,
    memorialized: !!doc.memorialized,
    memorialType: doc.memorialType || '',
    memorialDate: doc.memorialDate || ''
  };
}

module.exports = {
  cloud,
  fail,
  ok,
  text,
  day,
  fileIds,
  amount,
  interval,
  openContext,
  ensure,
  owned,
  plantView
};
