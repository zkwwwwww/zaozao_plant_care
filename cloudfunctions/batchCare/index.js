const crypto = require('crypto');
const { fail, ok, text, day, openContext, ensure } = require('./runtime');

const TYPES = ['浇水', '施肥', '修剪', '换盆', '防治病虫害', '测量', 'manual'];
const MAX_TASKS = 100;

function chinaToday() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

function recordId(openid, requestId, task, date) {
  return 'batch_' + crypto.createHash('sha256')
    .update(JSON.stringify([openid, requestId, task.plantId, task.type, date])).digest('hex').slice(0, 48);
}

async function complete(db, openid, task, date, requestId, multiple) {
  return db.runTransaction(async transaction => {
    const plantRef = transaction.collection('plants').doc(task.plantId);
    const snapshot = await plantRef.get();
    const plant = snapshot.data;
    if (!plant || plant._openid !== openid || plant.deleted || plant.memorialized || plant.status === '死亡') return 'skipped';
    const now = db.serverDate();
    if (task.type === 'manual') {
      const tasks = Array.isArray(plant.manualTasks) ? plant.manualTasks.slice() : [];
      const index = tasks.findIndex(item => item.id === task.taskId);
      if (index < 0) return 'skipped';
      if (!tasks[index].done) {
        tasks[index] = Object.assign({}, tasks[index], { done: true });
        await plantRef.update({ data: { manualTasks: tasks, updatedAt: now } });
      }
      return 'saved';
    }
    const ref = transaction.collection('care_records').doc(recordId(openid, requestId, task, date));
    const existing = await ref.get();
    // Stable IDs make an interrupted request safe to retry, including concurrent retries.
    if (existing.data) return existing.data.deleted ? 'skipped' : 'saved';
    await ref.set({ data: {
      _openid: openid, plantId: task.plantId, type: task.type, date,
      content: multiple ? '批量养护' : '', photo: '', deleted: false, createdAt: now, updatedAt: now
    } });
    return 'saved';
  });
}

exports.main = async event => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const input = event || {};
  const source = Array.isArray(input.tasks) ? input.tasks :
    (Array.isArray(input.plantIds) ? input.plantIds : []).map(plantId => ({ plantId, type: input.type }));
  if (!source.length) return fail('请先选择养护事项');
  if (source.length > MAX_TASKS) return fail('每批最多处理 ' + MAX_TASKS + ' 项');
  const tasks = [];
  const seen = new Set();
  for (const item of source) {
    if (!item || !text(item.plantId, 64) || TYPES.indexOf(item.type) < 0 ||
      (item.type === 'manual' && !text(item.taskId, 64))) return fail('养护事项不完整');
    const task = {
      plantId: text(item.plantId, 64), type: item.type, taskId: text(item.taskId, 64),
      key: text(item.key, 160) || text(item.plantId, 64) + '_' + item.type
    };
    const signature = JSON.stringify([task.plantId, task.type, task.taskId]);
    if (!seen.has(signature)) tasks.push(task);
    seen.add(signature);
  }
  const date = day(input.date) || chinaToday();
  const requestId = text(input.requestId, 64) || crypto.randomBytes(16).toString('hex');
  try {
    await ensure(ctx.db, 'plants');
    await ensure(ctx.db, 'care_records');
    const results = [];
    for (let i = 0; i < tasks.length; i += 10) {
      for (const result of await Promise.all(tasks.slice(i, i + 10).map(async task => {
        try {
          return { key: task.key, status: await complete(ctx.db, ctx.openid, task, date, requestId, tasks.length > 1) };
        } catch (error) {
          return { key: task.key, status: 'failed' };
        }
      }))) results.push(result);
    }
    return ok({
      saved: results.filter(item => item.status === 'saved').length,
      skipped: results.filter(item => item.status === 'skipped').length,
      failed: results.filter(item => item.status === 'failed').length, results, date
    });
  } catch (error) {
    console.error('batchCare failed');
    return fail('批量养护失败，请稍后重试');
  }
};
