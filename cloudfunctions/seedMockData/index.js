// 开发用：给当前微信用户写入 / 清除模拟数据。所有文档带 mock: true 和 mockKey，可重复执行
const fs = require('fs');
const path = require('path');
const { cloud, fail, ok, openContext, ensure } = require('./runtime');
const seed = require('./data');

const COLLECTIONS = ['environments', 'tags', 'plants', 'care_records', 'seedlings', 'expenses', 'memorials'];
const BATCH = 20;

function chinaDay(offset) {
  const now = new Date(Date.now() + 8 * 3600000 - (offset || 0) * 86400000);
  return now.toISOString().slice(0, 10);
}

function imageFile(key) {
  const dir = path.join(__dirname, 'images');
  const name = ['jpg', 'png'].map(ext => key + '.' + ext).find(file => fs.existsSync(path.join(dir, file)));
  return name ? path.join(dir, name) : '';
}

async function keyMap(db, openid, collection) {
  const map = {};
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await db.collection(collection).where({ _openid: openid, mock: true }).skip(skip).limit(100).get();
    page.data.forEach(doc => { map[doc.mockKey] = doc; });
    if (page.data.length < 100) break;
  }
  return map;
}

async function addAll(db, collection, rows) {
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(rows.slice(i, i + 10).map(row => db.collection(collection).add({ data: row })));
  }
}

function base(openid, key, now) {
  return { _openid: openid, mock: true, mockKey: key, deleted: false, createdAt: now, updatedAt: now };
}

function pics(files, keys) {
  return (keys || []).map(key => files[key]).filter(Boolean);
}

async function upload(keys) {
  const files = {};
  await Promise.all(keys.map(async key => {
    const file = imageFile(key);
    if (!file) return;
    const result = await cloud.uploadFile({
      cloudPath: 'mock/' + path.basename(file),
      fileContent: fs.readFileSync(file)
    });
    files[key] = result.fileID;
  }));
  return files;
}

// 每一步只处理 offset 起的 BATCH 条，返回下一步位置
const STEPS = {
  async environments(ctx, offset) {
    const items = seed.envs.slice(offset, offset + BATCH);
    const exists = await keyMap(ctx.db, ctx.openid, 'environments');
    await addAll(ctx.db, 'environments', items.filter(item => !exists[item.key]).map(item => Object.assign(base(ctx.openid, item.key, ctx.now), {
      name: item.name, lightIntensity: item.lightIntensity, lightHours: item.lightHours
    })));
    return { total: seed.envs.length };
  },

  async tags(ctx, offset) {
    const items = seed.tags.slice(offset, offset + BATCH);
    const exists = await keyMap(ctx.db, ctx.openid, 'tags');
    await addAll(ctx.db, 'tags', items.filter(item => !exists[item.key]).map(item => Object.assign(base(ctx.openid, item.key, ctx.now), {
      name: item.name
    })));
    return { total: seed.tags.length };
  },

  async plants(ctx, offset) {
    const items = seed.plants.slice(offset, offset + BATCH);
    const [exists, envs, tags] = await Promise.all([
      keyMap(ctx.db, ctx.openid, 'plants'),
      keyMap(ctx.db, ctx.openid, 'environments'),
      keyMap(ctx.db, ctx.openid, 'tags')
    ]);
    await addAll(ctx.db, 'plants', items.filter(item => !exists[item.key]).map(item => Object.assign(base(ctx.openid, item.key, ctx.now), {
      name: item.name,
      variety: item.variety,
      status: item.status,
      price: item.price,
      purchaseWay: item.purchaseWay,
      planting: item.planting,
      environmentId: envs[item.env] ? envs[item.env]._id : '',
      location: item.location,
      companionStart: chinaDay(item.bought),
      purchaseDate: chinaDay(item.bought),
      description: item.description,
      photos: pics(ctx.files, item.images),
      tags: item.tags.map(key => tags[key] && tags[key]._id).filter(Boolean),
      customWaterInterval: item.water,
      customFertInterval: item.fert,
      customRepotInterval: item.repot,
      memorialized: !!item.memorial,
      memorialType: item.memorial ? item.memorial.type : '',
      memorialDate: item.memorial ? chinaDay(item.memorial.daysAgo) : ''
    })));
    return { total: seed.plants.length };
  },

  async care_records(ctx, offset) {
    const all = [];
    seed.plants.forEach(plant => plant.records.forEach((record, index) => {
      all.push({ plant, record, key: plant.key + '-r' + index });
    }));
    const items = all.slice(offset, offset + BATCH);
    const [exists, plants] = await Promise.all([
      keyMap(ctx.db, ctx.openid, 'care_records'),
      keyMap(ctx.db, ctx.openid, 'plants')
    ]);
    await addAll(ctx.db, 'care_records', items.filter(item => !exists[item.key] && plants[item.plant.key]).map(item => Object.assign(base(ctx.openid, item.key, ctx.now), {
      plantId: plants[item.plant.key]._id,
      type: item.record[0],
      date: chinaDay(item.record[1]),
      content: item.record[2] || '',
      photo: item.record[3] ? (pics(ctx.files, item.plant.images)[0] || '') : ''
    })));
    return { total: all.length };
  },

  // 按定义顺序写入，母株是育苗时要求它排在前面
  async seedlings(ctx, offset) {
    const items = seed.seedlings.slice(offset, offset + BATCH);
    const plants = await keyMap(ctx.db, ctx.openid, 'plants');
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const exists = await keyMap(ctx.db, ctx.openid, 'seedlings');
      if (exists[item.key]) continue;
      const mother = item.mother || {};
      let motherInfo = { motherType: '', motherId: '', motherText: '', motherPhotos: [] };
      if (mother.plant && plants[mother.plant]) {
        motherInfo = { motherType: 'plant', motherId: plants[mother.plant]._id, motherText: '', motherPhotos: [] };
      } else if (mother.seedling && exists[mother.seedling]) {
        motherInfo = { motherType: 'seedling', motherId: exists[mother.seedling]._id, motherText: '', motherPhotos: [] };
      } else if (mother.text) {
        motherInfo = { motherType: 'text', motherId: '', motherText: mother.text, motherPhotos: pics(ctx.files, [mother.image]) };
      }
      await ctx.db.collection('seedlings').add({
        data: Object.assign(base(ctx.openid, item.key, ctx.now), motherInfo, {
          name: item.name,
          method: item.method,
          startDate: chinaDay(item.daysAgo),
          photos: pics(ctx.files, item.images),
          plannedCount: item.plannedCount,
          gridRows: item.gridRows,
          gridCols: item.gridCols,
          substrate: item.substrate,
          container: item.container,
          place: item.place,
          note: item.note
        })
      });
    }
    return { total: seed.seedlings.length };
  },

  async expenses(ctx, offset) {
    const items = seed.expenses.slice(offset, offset + BATCH);
    const exists = await keyMap(ctx.db, ctx.openid, 'expenses');
    await addAll(ctx.db, 'expenses', items.map((item, index) => ({ item, key: 'e' + (offset + index) }))
      .filter(row => !exists[row.key])
      .map(row => Object.assign(base(ctx.openid, row.key, ctx.now), {
        date: chinaDay(row.item[0]),
        category: row.item[1],
        amount: row.item[2],
        note: row.item[3]
      })));
    return { total: seed.expenses.length };
  },

  async memorials(ctx) {
    const [exists, plants] = await Promise.all([
      keyMap(ctx.db, ctx.openid, 'memorials'),
      keyMap(ctx.db, ctx.openid, 'plants')
    ]);
    const rows = seed.plants.filter(item => item.memorial && plants[item.key] && !exists['m-' + item.key]).map(item => {
      const days = item.bought - item.memorial.daysAgo;
      return Object.assign(base(ctx.openid, 'm-' + item.key, ctx.now), {
        plantId: plants[item.key]._id,
        name: item.name,
        photos: pics(ctx.files, item.images),
        type: item.memorial.type,
        date: chinaDay(item.memorial.daysAgo),
        note: item.memorial.note,
        companion: days >= 365 ? Math.floor(days / 365) + ' 年 ' + Math.floor((days % 365) / 30) + ' 个月' : Math.floor(days / 30) + ' 个月'
      });
    });
    await addAll(ctx.db, 'memorials', rows);
    return { total: seed.plants.filter(item => item.memorial).length };
  }
};

async function clear(db, openid) {
  const removed = {};
  for (let i = 0; i < COLLECTIONS.length; i += 1) {
    const name = COLLECTIONS[i];
    const result = await db.collection(name).where({ _openid: openid, mock: true }).remove();
    removed[name] = (result.stats && result.stats.removed) || 0;
  }
  return removed;
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const input = event || {};
  try {
    if (input.action === 'imageKeys') {
      const keys = {};
      seed.plants.forEach(item => item.images.forEach(key => { keys[key] = true; }));
      seed.seedlings.forEach(item => {
        item.images.forEach(key => { keys[key] = true; });
        if (item.mother && item.mother.image) keys[item.mother.image] = true;
      });
      return ok({ keys: Object.keys(keys).filter(imageFile) });
    }
    if (input.action === 'upload') {
      return ok({ files: await upload((input.keys || []).slice(0, 6)) });
    }
    for (let i = 0; i < COLLECTIONS.length; i += 1) await ensure(ctx.db, COLLECTIONS[i]);
    if (input.action === 'clear') return ok({ removed: await clear(ctx.db, ctx.openid) });
    if (input.action === 'seed') {
      const step = STEPS[input.step];
      if (!step) return fail('未知步骤');
      const offset = Math.max(0, Number(input.offset) || 0);
      const result = await step({ db: ctx.db, openid: ctx.openid, files: input.files || {}, now: ctx.db.serverDate() }, offset);
      const next = offset + BATCH < result.total ? offset + BATCH : null;
      return ok({ step: input.step, next, total: result.total });
    }
    if (input.action === 'count') {
      const counts = {};
      for (let i = 0; i < COLLECTIONS.length; i += 1) {
        const name = COLLECTIONS[i];
        counts[name] = (await ctx.db.collection(name).where({ _openid: ctx.openid, mock: true }).count()).total;
      }
      return ok({ counts, openidTail: ctx.openid.slice(-6) });
    }
    return fail('未知操作');
  } catch (error) {
    console.error('seedMockData failed', error && error.message);
    return fail((error && error.message) || '模拟数据操作失败');
  }
};
