// utils/storage.js 本地存储读写封装
// 数据全部保存在本机微信存储中，无需后端。

const KEYS = {
  plants: 'plants',
  envs: 'envs',
  memorial: 'memorialPlants'
};

function _read(key) {
  const v = wx.getStorageSync(key);
  return (Array.isArray(v) ? v : []);
}

function _write(key, list) {
  wx.setStorageSync(key, list);
}

// ---- 植物 ----
function getPlants() {
  return _read(KEYS.plants);
}

function getPlant(id) {
  return getPlants().find(p => p.id === id) || null;
}

function savePlant(plant) {
  const list = getPlants();
  const idx = list.findIndex(p => p.id === plant.id);
  if (idx >= 0) {
    list[idx] = plant;
  } else {
    list.push(plant);
  }
  _write(KEYS.plants, list);
}

function deletePlant(id) {
  _write(KEYS.plants, getPlants().filter(p => p.id !== id));
}

function addRecord(plantId, record) {
  const plant = getPlant(plantId);
  if (!plant) return;
  plant.records = plant.records || [];
  plant.records.push(record);
  // 按日期倒序
  plant.records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  savePlant(plant);
}

// ---- 环境 ----
function getEnvs() {
  return _read(KEYS.envs);
}

function getEnv(id) {
  return getEnvs().find(e => e.id === id) || null;
}

function saveEnv(env) {
  const list = getEnvs();
  const idx = list.findIndex(e => e.id === env.id);
  if (idx >= 0) {
    list[idx] = env;
  } else {
    list.push(env);
  }
  _write(KEYS.envs, list);
}

function deleteEnv(id) {
  _write(KEYS.envs, getEnvs().filter(e => e.id !== id));
}

// ---- 纪念（送人 / 去世） ----
function getMemorials() {
  return _read(KEYS.memorial);
}

function saveMemorial(mem) {
  const list = getMemorials();
  const idx = list.findIndex(m => m.id === mem.id);
  if (idx >= 0) list[idx] = mem;
  else list.push(mem);
  _write(KEYS.memorial, list);
}

function getMemorial(id) {
  return getMemorials().find(m => m.id === id) || null;
}

function removeMemorial(id) {
  _write(KEYS.memorial, getMemorials().filter(m => m.id !== id));
}

// ---- ID 生成 ----
function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

module.exports = {
  getPlants,
  getPlant,
  savePlant,
  deletePlant,
  addRecord,
  getEnvs,
  getEnv,
  saveEnv,
  deleteEnv,
  getMemorials,
  saveMemorial,
  getMemorial,
  removeMemorial,
  genId
};
