const { fail, ok, text, day, fileIds, amount, interval, openContext, ensure } = require('./runtime');

const MAX = { environments: 50, plants: 80, records: 400, memorials: 80 };
const STATUSES = ['健康', '病害', '虫害', '待观察', '休眠', '死亡'];
const LEGACY_STATUS = { 生长中: '健康', 状态一般: '健康', 需要关注: '待观察', 生病中: '病害' };
const RECORD_TYPES = ['浇水', '施肥', '修剪', '换盆', '防治病虫害', '测量'];

async function findByClient(db, collection, openid, clientId) {
  const found = await db.collection(collection).where({ _openid: openid, clientId }).limit(1).get();
  return found.data[0] && !found.data[0].deleted ? found.data[0] : null;
}

async function markUser(db, openid, status) {
  await ensure(db, 'users');
  const users = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const data = { migrationStatus: status, updatedAt: db.serverDate() };
  if (users.data.length) {
    await db.collection('users').doc(users.data[0]._id).update({ data });
    return;
  }
  await db.collection('users').add({
    data: Object.assign({ _openid: openid, createdAt: db.serverDate() }, data)
  });
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  const groups = ['environments', 'plants', 'records', 'memorials'];
  for (let i = 0; i < groups.length; i += 1) {
    const list = input[groups[i]];
    if (list && !Array.isArray(list)) return fail('迁移数据格式不正确');
    if (list && list.length > MAX[groups[i]]) return fail('本机数据过多，请先导出后再迁移');
  }

  const summary = { environments: 0, plants: 0, records: 0, memorials: 0, failed: 0 };
  try {
    await ensure(db, 'environments');
    await ensure(db, 'plants');
    await ensure(db, 'care_records');
    await ensure(db, 'memorials');
    const now = db.serverDate();
    const envIds = {};
    const plantIds = {};
    const environments = input.environments || [];
    for (let i = 0; i < environments.length; i += 1) {
      const item = environments[i] || {};
      const clientId = text(item.clientId, 64);
      const name = text(item.name, 40);
      if (!clientId || !name) {
        summary.failed += 1;
        continue;
      }
      try {
        const existing = await findByClient(db, 'environments', openid, clientId);
        if (existing) {
          envIds[clientId] = existing._id;
        } else {
          const added = await db.collection('environments').add({
            data: {
              _openid: openid,
              clientId,
              name,
              lightIntensity: text(item.lightIntensity, 12),
              lightHours: text(item.lightHours, 12),
              deleted: false,
              createdAt: now,
              updatedAt: now
            }
          });
          envIds[clientId] = added._id;
        }
        summary.environments += 1;
      } catch (error) {
        summary.failed += 1;
      }
    }

    const plants = input.plants || [];
    for (let i = 0; i < plants.length; i += 1) {
      const item = plants[i] || {};
      const clientId = text(item.clientId, 64);
      const name = text(item.name, 40);
      if (!clientId || !name) {
        summary.failed += 1;
        continue;
      }
      try {
        const existing = await findByClient(db, 'plants', openid, clientId);
        if (existing) {
          plantIds[clientId] = existing._id;
        } else {
          const added = await db.collection('plants').add({
            data: {
              _openid: openid,
              clientId,
              name,
              variety: text(item.variety, 40),
              status: STATUSES.indexOf(item.status) >= 0 ? item.status : (LEGACY_STATUS[item.status] || '健康'),
              price: amount(item.price),
              purchaseWay: text(item.purchaseWay, 20),
              planting: text(item.planting, 20),
              environmentId: envIds[item.environmentClientId] || '',
              location: text(item.location, 40),
              companionStart: day(item.companionStart),
              purchaseDate: day(item.purchaseDate),
              description: text(item.description, 500),
              photos: fileIds(item.photos, 9),
              customWaterInterval: interval(item.customWaterInterval),
              customFertInterval: interval(item.customFertInterval),
              customRepotInterval: interval(item.customRepotInterval),
              reminderAdvanceDays: item.reminderAdvanceDays == null
                ? 1
                : Math.min(30, Math.max(0, Math.round(Number(item.reminderAdvanceDays) || 0))),
              memorialized: false,
              deleted: false,
              createdAt: now,
              updatedAt: now
            }
          });
          plantIds[clientId] = added._id;
        }
        summary.plants += 1;
      } catch (error) {
        summary.failed += 1;
      }
    }

    const records = input.records || [];
    for (let i = 0; i < records.length; i += 1) {
      const item = records[i] || {};
      const clientId = text(item.clientId, 64);
      const plantId = plantIds[item.plantClientId];
      const type = RECORD_TYPES.indexOf(item.type) >= 0 ? item.type : '';
      const date = day(item.date);
      if (!clientId || !plantId || !type || !date) {
        summary.failed += 1;
        continue;
      }
      try {
        if (!await findByClient(db, 'care_records', openid, clientId)) {
          await db.collection('care_records').add({
            data: {
              _openid: openid,
              clientId,
              plantId,
              type,
              date,
              content: text(item.content, 500),
              photo: fileIds(item.photo ? [item.photo] : [], 1)[0] || '',
              deleted: false,
              createdAt: now,
              updatedAt: now
            }
          });
        }
        summary.records += 1;
      } catch (error) {
        summary.failed += 1;
      }
    }

    const memorials = input.memorials || [];
    for (let i = 0; i < memorials.length; i += 1) {
      const item = memorials[i] || {};
      const plantId = plantIds[item.plantClientId];
      const type = item.type === '送人' || item.type === '去世' ? item.type : '';
      const date = day(item.date);
      const clientId = text(item.clientId, 64) || (item.plantClientId ? text(item.plantClientId, 60) + ':memorial' : '');
      if (!clientId || !plantId || !type || !date) {
        summary.failed += 1;
        continue;
      }
      try {
        if (!await findByClient(db, 'memorials', openid, clientId)) {
          const plant = await db.collection('plants').doc(plantId).get();
          await db.collection('memorials').add({
            data: {
              _openid: openid,
              clientId,
              plantId,
              name: (plant.data && plant.data.name) || text(item.name, 40),
              photos: (plant.data && plant.data.photos) || [],
              type,
              date,
              note: text(item.note, 200),
              companion: text(item.companion, 40),
              deleted: false,
              createdAt: now,
              updatedAt: now
            }
          });
          await db.collection('plants').doc(plantId).update({
            data: { memorialized: true, memorialType: type, memorialDate: date, updatedAt: now }
          });
        }
        summary.memorials += 1;
      } catch (error) {
        summary.failed += 1;
      }
    }

    const status = summary.failed ? 'partial' : 'done';
    await markUser(db, openid, status);
    return ok({ summary, migrationStatus: status });
  } catch (error) {
    console.error('migrateLocalData failed');
    return fail('迁移失败，请稍后重试');
  }
};
