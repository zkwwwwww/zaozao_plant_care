const account = require('./account');
const profile = require('../utils/profile');
const storage = require('../utils/storage');
const constants = require('../utils/constants');

function call(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data: data || {},
      success: (res) => {
        const result = res.result || {};
        if (!result.ok) {
          reject(new Error(result.message || '操作失败，请重试'));
          return;
        }
        resolve(result);
      },
      fail: (error) => {
        const message = (error && error.errMsg) || '';
        if (/not found|not exist|不存在|FUNCTION_NOT_FOUND/i.test(message)) {
          reject(new Error('云函数尚未部署：' + name));
          return;
        }
        reject(new Error('网络异常，请重试'));
      }
    });
  });
}

function isMissing(error) {
  const text = JSON.stringify(error || {});
  return /not exist|不存在|-502005|DATABASE_COLLECTION_NOT_EXIST/i.test(text);
}

// 小程序端单次查询最多返回 20 条
const PAGE_SIZE = 20;
const MAX_ROWS = 2000;

function liveQuery(collection) {
  const db = wx.cloud.database();
  return db.collection(collection).where({ deleted: db.command.neq(true) });
}

function getPage(collection, skip) {
  return new Promise((resolve, reject) => {
    liveQuery(collection).skip(skip).limit(PAGE_SIZE).get({ success: resolve, fail: reject });
  });
}

function countRows(collection) {
  return new Promise((resolve, reject) => {
    liveQuery(collection).count({ success: res => resolve(res.total || 0), fail: reject });
  });
}

async function queryAll(collection) {
  try {
    const total = Math.min(await countRows(collection), MAX_ROWS);
    const skips = [];
    for (let skip = 0; skip < total; skip += PAGE_SIZE) skips.push(skip);
    const pages = await Promise.all(skips.map(skip => getPage(collection, skip)));
    const seen = {};
    const rows = [];
    pages.forEach(page => (page.data || []).forEach(doc => {
      if (seen[doc._id]) return;
      seen[doc._id] = true;
      rows.push(doc);
    }));
    return rows;
  } catch (error) {
    if (isMissing(error)) return [];
    throw new Error('读取数据失败，请下拉重试');
  }
}

function uploadPhoto(filePath, folder) {
  if (!filePath) return Promise.resolve('');
  if (profile.isCloudFileId(filePath)) return Promise.resolve(filePath);
  const matched = String(filePath).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = matched ? matched[1].toLowerCase() : 'jpg';
  const cloudPath = folder + '/' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '.' + ext;
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: () => reject(new Error('图片上传失败，请重试'))
    });
  });
}

async function uploadPhotos(paths, folder) {
  const result = [];
  for (let i = 0; i < (paths || []).length; i += 1) {
    result.push(await uploadPhoto(paths[i], folder));
  }
  return result.filter(Boolean);
}

function toRecord(doc) {
  return {
    id: doc._id,
    plantId: doc.plantId,
    type: doc.type || '',
    date: doc.date || '',
    content: doc.content || '',
    photo: doc.photo || ''
  };
}

function toPlant(doc, records) {
  return {
    id: doc._id,
    clientId: doc.clientId || '',
    name: doc.name || '',
    variety: doc.variety || '',
    status: constants.normalizeStatus(doc.status),
    price: doc.price === 0 ? 0 : (doc.price || ''),
    purchaseWay: doc.purchaseWay || '',
    planting: doc.planting || '',
    environmentId: doc.environmentId || '',
    location: doc.location || '',
    companionStart: doc.companionStart || '',
    purchaseDate: doc.purchaseDate || '',
    description: doc.description || '',
    photos: doc.photos || [],
    tags: doc.tags || [],
    customWaterInterval: doc.customWaterInterval || 0,
    customFertInterval: doc.customFertInterval || 0,
    customRepotInterval: doc.customRepotInterval || 0,
    reminderAdvanceDays: doc.reminderAdvanceDays == null ? 1 : Number(doc.reminderAdvanceDays),
    memorialized: !!doc.memorialized,
    memorialType: doc.memorialType || '',
    memorialDate: doc.memorialDate || '',
    records: records.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  };
}

function toEnv(doc) {
  return {
    id: doc._id,
    name: doc.name || '',
    lightIntensity: doc.lightIntensity || '',
    lightHours: doc.lightHours || ''
  };
}

function toMemorial(doc) {
  return {
    id: doc.plantId,
    name: doc.name || '',
    photos: doc.photos || [],
    type: doc.type || '',
    date: doc.date || '',
    note: doc.note || '',
    companion: doc.companion || ''
  };
}

function toSeedling(doc) {
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

function toExpense(doc) {
  return {
    id: doc._id,
    date: doc.date || '',
    category: doc.category || '',
    amount: Number(doc.amount) || 0,
    note: doc.note || ''
  };
}

function toTag(doc) {
  return { id: doc._id, name: doc.name || '' };
}

async function ensureEnvironments(envs) {
  if (envs.length) return envs;
  const session = account.getSession() || {};
  if (storage.getEnvs().length && session.migrationStatus !== 'done') return envs;
  const created = [];
  for (let i = 0; i < storage.DEFAULT_ENVS.length; i += 1) {
    const item = storage.DEFAULT_ENVS[i];
    const result = await call('saveEnvironment', {
      name: item.name,
      lightIntensity: item.lightIntensity,
      lightHours: item.lightHours
    });
    created.push(result.environment);
  }
  return created;
}

let pendingBundle = null;
let cachedBundle = null;
let cachedAt = 0;
let cachedOpenid = '';
let cacheVersion = 0;
const BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateBundle() {
  cacheVersion += 1;
  cachedBundle = null;
  cachedAt = 0;
  cachedOpenid = '';
  pendingBundle = null;
}

async function loadBundle(options) {
  const force = !!(options && options.force);
  const session = account.getSession() || {};
  const openid = session.openid || '';
  const cacheValid = cachedBundle
    && cachedOpenid === openid
    && Date.now() - cachedAt < BUNDLE_CACHE_TTL_MS;
  if (!force && cacheValid) return cachedBundle;
  if (pendingBundle) return pendingBundle;
  const version = cacheVersion;
  const request = loadBundleNow()
    .then(bundle => {
      if (version === cacheVersion) {
        cachedBundle = bundle;
        cachedAt = Date.now();
        cachedOpenid = openid;
      }
      return bundle;
    })
    .finally(() => {
      if (pendingBundle === request) pendingBundle = null;
    });
  pendingBundle = request;
  return pendingBundle;
}

async function loadBundleNow() {
  const [plantDocs, recordDocs, envDocs, memorialDocs, seedlingDocs, expenseDocs, tagDocs] = await Promise.all([
    queryAll('plants'),
    queryAll('care_records'),
    queryAll('environments'),
    queryAll('memorials'),
    queryAll('seedlings'),
    queryAll('expenses'),
    queryAll('tags')
  ]);
  const records = recordDocs.map(toRecord);
  return {
    plants: plantDocs.map(doc => toPlant(doc, records.filter(record => record.plantId === doc._id))),
    envs: await ensureEnvironments(envDocs.map(toEnv)),
    memorials: memorialDocs.map(toMemorial),
    seedlings: seedlingDocs.map(toSeedling).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')),
    expenses: expenseDocs.map(toExpense).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    tags: tagDocs.map(toTag).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  };
}

async function savePlant(plant) {
  const photos = await uploadPhotos(plant.photos, 'plants');
  const result = await call('savePlant', {
    id: plant.id || '',
    name: plant.name,
    variety: plant.variety,
    status: plant.status,
    price: plant.price,
    purchaseWay: plant.purchaseWay,
    planting: plant.planting,
    environmentId: plant.environmentId,
    location: plant.location,
    companionStart: plant.companionStart,
    purchaseDate: plant.purchaseDate,
    description: plant.description,
    photos,
    tags: plant.tags || [],
    customWaterInterval: plant.customWaterInterval,
    customFertInterval: plant.customFertInterval,
    customRepotInterval: plant.customRepotInterval,
    reminderAdvanceDays: plant.reminderAdvanceDays,
    clientId: plant.clientId || ''
  });
  invalidateBundle();
  return result.plant;
}

async function saveRecord(record) {
  const photo = await uploadPhoto(record.photo, 'records');
  const result = await call('saveRecord', {
    id: record.id || '',
    plantId: record.plantId,
    type: record.type,
    date: record.date,
    content: record.content,
    photo,
    clientId: record.clientId || ''
  });
  invalidateBundle();
  return result.record;
}

async function saveSeedling(seedling) {
  const photos = await uploadPhotos(seedling.photos, 'seedlings');
  const motherPhotos = seedling.motherType === 'text' ? await uploadPhotos(seedling.motherPhotos, 'seedlings') : [];
  const result = await call('manageSeedling', Object.assign({}, seedling, { photos, motherPhotos }));
  invalidateBundle();
  return result.seedling;
}

function mutate(name, data) {
  return call(name, data).then(result => {
    invalidateBundle();
    return result;
  });
}

function plantPayload(plant) {
  return {
    id: plant.id || '',
    name: plant.name,
    variety: plant.variety,
    status: plant.status,
    price: plant.price,
    purchaseWay: plant.purchaseWay,
    planting: plant.planting,
    environmentId: plant.environmentId,
    location: plant.location,
    companionStart: plant.companionStart,
    purchaseDate: plant.purchaseDate,
    description: plant.description,
    photos: plant.photos,
    tags: plant.tags || [],
    customWaterInterval: plant.customWaterInterval,
    customFertInterval: plant.customFertInterval,
    customRepotInterval: plant.customRepotInterval,
    reminderAdvanceDays: plant.reminderAdvanceDays
  };
}

module.exports = {
  loadBundle,
  invalidateBundle,
  uploadPhoto,
  savePlant,
  saveRecord,
  saveEnv: (env) => mutate('saveEnvironment', env).then(result => result.environment),
  deleteEnv: (id) => mutate('deleteEnvironment', { id }),
  memorialize: (payload) => mutate('memorializePlant', payload),
  restorePlant: (plantId) => mutate('restorePlant', { plantId }),
  deletePlant: (plantId) => mutate('deletePlant', { plantId }),
  deleteRecord: (id) => mutate('deleteRecord', { id }),
  exportData: () => call('exportUserData'),
  migrate: (payload) => mutate('migrateLocalData', payload),
  saveSeedling,
  deleteSeedling: (id) => mutate('manageSeedling', { action: 'delete', id }),
  saveExpense: (expense) => mutate('manageExpense', expense).then(result => result.expense),
  deleteExpense: (id) => mutate('manageExpense', { action: 'delete', id }),
  saveTag: (tag) => mutate('manageTag', tag).then(result => result.tag),
  deleteTag: (id) => mutate('manageTag', { action: 'delete', id }),
  mergeEnvironmentTag: (environmentId) => mutate('manageTag', { action: 'mergeEnvironment', environmentId }),
  batchCare: (plantIds, type) => mutate('batchCare', { plantIds, type }),
  plantPayload
};
