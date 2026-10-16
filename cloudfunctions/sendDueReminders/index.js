const { cloud, fail, ok, text, openContext, ensure } = require('./runtime');

function chinaToday() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return shifted.getUTCFullYear() + '-' + month + '-' + day;
}

function addDays(date, days) {
  const matched = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return '';
  const next = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]) + days));
  return next.toISOString().slice(0, 10);
}

function waterInterval(plant, today) {
  if (plant.customWaterInterval > 0) return plant.customWaterInterval;
  const month = Number(today.slice(5, 7));
  if (month >= 6 && month <= 8) return 5;
  if (month === 12 || month <= 2) return 15;
  return 10;
}

function lastDate(records, type, plant) {
  let latest = '';
  records.forEach(record => {
    if (record.type === type && record.date > latest) latest = record.date;
  });
  if (latest) return latest;
  if (/^\d{4}-\d{2}-\d{2}$/.test(plant.companionStart || '')) return plant.companionStart;
  if (/^\d{4}-\d{2}-\d{2}$/.test(plant.purchaseDate || '')) return plant.purchaseDate;
  return '';
}

function dueTasks(plant, records, today) {
  const specs = [
    ['water', '浇水', waterInterval(plant, today)],
    ['fertilize', '施肥', plant.customFertInterval > 0 ? plant.customFertInterval : 30],
    ['repot', '换盆', plant.customRepotInterval > 0 ? plant.customRepotInterval : 365]
  ];
  const tasks = [];
  specs.forEach(spec => {
    const last = lastDate(records, spec[1], plant);
    const due = last ? addDays(last, spec[2]) : '';
    const advance = plant.reminderAdvanceDays == null
      ? 1
      : Math.min(30, Math.max(0, Math.round(Number(plant.reminderAdvanceDays) || 0)));
    if (due && addDays(due, -advance) === today) {
      tasks.push({ type: spec[0], label: spec[1], due });
    }
  });
  return tasks;
}

async function listAll(db, collection, where) {
  const rows = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await db.collection(collection).where(where).skip(skip).limit(100).get();
    rows.push.apply(rows, page.data);
    if (page.data.length < 100) break;
  }
  return rows;
}

async function authorize(event) {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const templateId = text(event.templateId, 80);
  if (!templateId) return fail('未配置订阅消息模板');
  await ensure(ctx.db, 'users');
  const users = await ctx.db.collection('users').where({ _openid: ctx.openid }).limit(1).get();
  const subscribe = {
    templateId,
    authorized: event.authorized === true,
    updatedAt: ctx.db.serverDate()
  };
  if (!users.data.length) return fail('请先登录');
  await ctx.db.collection('users').doc(users.data[0]._id).update({ data: { subscribe } });
  return ok();
}

exports.main = async (event) => {
  if (event && event.action === 'authorize') return authorize(event);
  const ctx = await openContext(false);
  const db = ctx.db;
  try {
    await ensure(db, 'users');
    await ensure(db, 'plants');
    await ensure(db, 'care_records');
    await ensure(db, 'notification_logs');
    const today = chinaToday();
    const users = await listAll(db, 'users', { 'subscribe.authorized': true });
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < users.length; i += 1) {
      const user = users[i];
      const openid = user._openid;
      const templateId = user.subscribe && user.subscribe.templateId;
      if (!openid || !templateId) {
        skipped += 1;
        continue;
      }
      const plants = await listAll(db, 'plants', { _openid: openid, deleted: false, memorialized: false });
      const records = await listAll(db, 'care_records', { _openid: openid, deleted: false });
      for (let p = 0; p < plants.length; p += 1) {
        const plant = plants[p];
        if (plant.status === '死亡') continue;
        const mine = records.filter(record => record.plantId === plant._id);
        const tasks = dueTasks(plant, mine, today);
        for (let t = 0; t < tasks.length; t += 1) {
          const task = tasks[t];
          const dedupeKey = openid + ':' + plant._id + ':' + task.type + ':' + task.due;
          const existing = await db.collection('notification_logs').where({ dedupeKey, status: 'sent' }).limit(1).get();
          if (existing.data.length) {
            skipped += 1;
            continue;
          }
          const name = text(plant.name, 20) || '植物';
          try {
            await cloud.openapi.subscribeMessage.send({
              touser: openid,
              templateId,
              page: 'pages/reminders/reminders',
              miniprogramState: 'formal',
              data: {
                thing1: { value: name },
                thing2: { value: task.label },
                date3: { value: task.due }
              }
            });
            await db.collection('notification_logs').add({
              data: {
                _openid: openid,
                dedupeKey,
                plantId: plant._id,
                type: task.type,
                due: task.due,
                status: 'sent',
                createdAt: db.serverDate()
              }
            });
            sent += 1;
          } catch (error) {
            failed += 1;
            console.error('sendDueReminders send failed', error && error.errCode);
          }
        }
      }
    }
    return ok({ date: today, sent, failed, skipped });
  } catch (error) {
    console.error('sendDueReminders failed');
    return fail('提醒任务执行失败');
  }
};
