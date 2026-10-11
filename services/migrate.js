const storage = require('../utils/storage');
const account = require('./account');
const data = require('./data');
const cloudModel = require('../utils/cloud-model');

let prompted = false;

function hasLocalData() {
  return storage.getPlants().length > 0 || storage.getMemorials().length > 0 || storage.getEnvs().length > 0;
}

function needsMigration() {
  const session = account.getSession() || {};
  return session.migrationStatus !== 'done' && hasLocalData();
}

async function uploadOrEmpty(path, folder) {
  if (!path) return '';
  try {
    return await data.uploadPhoto(path, folder);
  } catch (error) {
    return '';
  }
}

async function run() {
  let failed = 0;
  const envIds = {};
  const environments = cloudModel.dedupeByClientId(storage.getEnvs().map(env => ({
    clientId: env.id,
    name: env.name,
    lightIntensity: env.lightIntensity,
    lightHours: env.lightHours
  })));
  for (let i = 0; i < environments.length; i += 1) {
    try {
      const saved = await data.saveEnv(environments[i]);
      envIds[environments[i].clientId] = saved.id;
    } catch (error) {
      failed += 1;
    }
  }

  const plantIds = {};
  const sourcePlants = cloudModel.dedupeByClientId(storage.getPlants().map(plant => Object.assign({ clientId: plant.id }, plant)));
  for (let i = 0; i < sourcePlants.length; i += 1) {
    const plant = sourcePlants[i];
    const photos = [];
    for (let p = 0; p < (plant.photos || []).length; p += 1) {
      const fileId = await uploadOrEmpty(plant.photos[p], 'plants');
      if (fileId) photos.push(fileId);
    }
    try {
      const saved = await data.savePlant(Object.assign(data.plantPayload(plant), {
        id: '',
        clientId: plant.clientId,
        environmentId: envIds[plant.environmentId] || '',
        photos
      }));
      plantIds[plant.clientId] = saved.id;
      const sourceRecords = plant.records || [];
      for (let r = 0; r < sourceRecords.length; r += 1) {
        const record = sourceRecords[r];
        try {
          await data.saveRecord({
            clientId: record.id || (plant.clientId + ':' + (record.date || '') + ':' + (record.type || '') + ':' + r),
            plantId: saved.id,
            type: record.type,
            date: record.date,
            content: record.content,
            photo: await uploadOrEmpty(record.photo, 'records')
          });
        } catch (error) {
          failed += 1;
        }
      }
    } catch (error) {
      failed += 1;
    }
  }

  const memorials = cloudModel.dedupeByClientId(storage.getMemorials().map(item => ({
    clientId: item.id,
    plantId: plantIds[item.id] || '',
    type: item.type,
    date: item.date,
    note: item.note,
    companion: item.companion
  })));
  for (let i = 0; i < memorials.length; i += 1) {
    if (!memorials[i].plantId) {
      failed += 1;
      continue;
    }
    try {
      await data.memorialize(memorials[i]);
    } catch (error) {
      failed += 1;
    }
  }

  if (failed) {
    account.patchSession({ migrationStatus: 'partial' });
    throw new Error('有 ' + failed + ' 项没有迁完，可再次迁移');
  }
  const result = await data.migrate({ environments: [], plants: [], records: [], memorials: [] });
  account.patchSession({ migrationStatus: result.migrationStatus || 'done' });
  return result;
}

function promptOnce() {
  if (prompted || !needsMigration()) return Promise.resolve(false);
  prompted = true;
  return new Promise((resolve) => {
    wx.showModal({
      title: '迁移本机数据',
      content: '发现本机保存的植物数据。迁移到云端后可以换设备查看，本机原数据会保留。',
      confirmText: '开始迁移',
      confirmColor: '#2e7d5b',
      success: async (res) => {
        if (!res.confirm) {
          resolve(false);
          return;
        }
        wx.showLoading({ title: '正在迁移', mask: true });
        try {
          await run();
          wx.showToast({ title: '迁移完成', icon: 'success' });
          resolve(true);
        } catch (error) {
          prompted = false;
          wx.showToast({ title: error.message || '迁移失败，请重试', icon: 'none' });
          resolve(false);
        } finally {
          wx.hideLoading();
        }
      },
      fail: () => resolve(false)
    });
  });
}

module.exports = {
  hasLocalData,
  needsMigration,
  run,
  promptOnce
};
