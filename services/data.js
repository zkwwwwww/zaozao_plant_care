const account = require('./account');
const profile = require('../utils/profile');
const storage = require('../utils/storage');

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

function getPage(collection, skip) {
  const db = wx.cloud.database();
  return new Promise((resolve, reject) => {
    db.collection(collection).where({ deleted: db.command.neq(true) }).skip(skip).limit(100).get({
      success: resolve,
      fail: reject
    });
  });
}

async function queryAll(collection) {
  const rows = [];
  for (let skip = 0; skip < 500; skip += 100) {
    let page;
    try {
      page = await getPage(collection, skip);
    } catch (error) {
      if (isMissing(error)) return [];
      throw new Error('读取数据失败，请下拉重试');
    }
    rows.push.apply(rows, page.data || []);
    if (!page.data || page.data.length < 100) break;
  }
  return rows;
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

async function loadBundle() {
  if (pendingBundle) return pendingBundle;
  pendingBundle = loadBundleNow().finally(() => {
    pendingBundle = null;
  });
  return pendingBundle;
}

async function loadBundleNow() {
  const [plantDocs, recordDocs, envDocs, memorialDocs] = await Promise.all([
    queryAll('plants'),
    queryAll('care_records'),
    queryAll('environments'),
    queryAll('memorials')
  ]);
  const records = recordDocs.map(toRecord);
  return {
    plants: plantDocs.map(doc => toPlant(doc, records.filter(record => record.plantId === doc._id))),
    envs: await ensureEnvironments(envDocs.map(toEnv)),
    memorials: memorialDocs.map(toMemorial)
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
    customWaterInterval: plant.customWaterInterval,
    customFertInterval: plant.customFertInterval,
    customRepotInterval: plant.customRepotInterval,
    clientId: plant.clientId || ''
  });
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
  return result.record;
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
    customWaterInterval: plant.customWaterInterval,
    customFertInterval: plant.customFertInterval,
    customRepotInterval: plant.customRepotInterval
  };
}

module.exports = {
  loadBundle,
  uploadPhoto,
  savePlant,
  saveRecord,
  saveEnv: (env) => call('saveEnvironment', env).then(result => result.environment),
  deleteEnv: (id) => call('deleteEnvironment', { id }),
  memorialize: (payload) => call('memorializePlant', payload),
  restorePlant: (plantId) => call('restorePlant', { plantId }),
  deletePlant: (plantId) => call('deletePlant', { plantId }),
  deleteRecord: (id) => call('deleteRecord', { id }),
  exportData: () => call('exportUserData'),
  migrate: (payload) => call('migrateLocalData', payload),
  plantPayload
};
