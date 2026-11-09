const { fail, ok, text, day, fileIds, amount, interval, openContext, ensure, owned, plantView } = require('./runtime');
const crypto = require('crypto');

function rejectChange(message) {
  const error = new Error(message);
  error.userMessage = message;
  throw error;
}

async function updateTask(db, openid, input) {
  const id = text(input.id, 64);
  if (!id) return fail('植物不存在或已被删除');
  try {
    await ensure(db, 'plants');
    await db.runTransaction(async transaction => {
      const ref = transaction.collection('plants').doc(id);
      const snapshot = await ref.get();
      const plant = snapshot.data;
      if (!plant || plant._openid !== openid || plant.deleted) rejectChange('植物不存在或已被删除');
      const data = { updatedAt: db.serverDate() };
      if (input.action === 'ignoreReminder') {
        if (['water', 'fertilize', 'repot'].indexOf(input.type) < 0) rejectChange('提醒类型无效');
        data['reminderIgnores.' + input.type] = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      } else {
        const tasks = Array.isArray(plant.manualTasks) ? plant.manualTasks.slice() : [];
        const taskId = text(input.taskId, 64);
        if (!taskId) rejectChange('任务编号无效');
        const index = tasks.findIndex(task => task.id === taskId);
        if (input.action === 'addManualTask') {
          const title = text(input.title, 40);
          if (!title) rejectChange('请填写任务内容');
          if (index < 0) {
            if (tasks.length >= 50) rejectChange('最多保存 50 条手动任务，请先删除不需要的任务');
            tasks.push({ id: taskId, title, done: false, createdAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) });
          }
        } else if (input.action === 'setManualTask') {
          if (index < 0) rejectChange('任务不存在或已被删除');
          if (typeof input.done !== 'boolean') rejectChange('任务状态无效');
          tasks[index] = Object.assign({}, tasks[index], { done: input.done });
        } else if (input.action === 'removeManualTask') {
          if (index >= 0) tasks.splice(index, 1);
        } else rejectChange('操作类型无效');
        data.manualTasks = tasks;
      }
      await ref.update({ data });
    });
    return ok();
  } catch (error) {
    return fail(error.userMessage || '更新失败，请稍后重试');
  }
}

const STATUSES = ['健康', '病害', '虫害', '待观察', '休眠', '死亡'];
const LEGACY_STATUS = { 生长中: '健康', 状态一般: '健康', 需要关注: '待观察', 生病中: '病害' };

function status(value) {
  if (STATUSES.indexOf(value) >= 0) return value;
  return LEGACY_STATUS[value] || '健康';
}

function tagIds(list) {
  const source = Array.isArray(list) ? list : [];
  const result = [];
  source.forEach(item => {
    const id = text(item, 64);
    if (id && result.indexOf(id) < 0 && result.length < 20) result.push(id);
  });
  return result;
}

function advanceDays(value) {
  if (value === '' || value == null) return 1;
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(30, Math.max(0, Math.round(number)));
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const { db, openid } = ctx;
  const input = event || {};
  if (input.action) return updateTask(db, openid, input);
  if (Array.isArray(input.manualTasks) && input.manualTasks.length > 50) return fail('最多保存 50 条手动任务');
  const name = text(input.name, 40);
  if (!name) return fail('请填写植物名称');

  try {
    await ensure(db, 'plants');
    const now = db.serverDate();
    const data = {
      name,
      variety: text(input.variety, 40),
      status: status(input.status),
      price: amount(input.price),
      purchaseWay: text(input.purchaseWay, 20),
      giftFrom: text(input.giftFrom, 40),
      planting: text(input.planting, 20),
      environmentId: text(input.environmentId, 64),
      location: text(input.location, 40),
      companionStart: day(input.companionStart),
      purchaseDate: day(input.purchaseDate),
      description: text(input.description, 500),
      photos: fileIds(input.photos, 9),
      customWaterInterval: interval(input.customWaterInterval),
      customFertInterval: interval(input.customFertInterval),
      customRepotInterval: interval(input.customRepotInterval),
      reminderAdvanceDays: advanceDays(input.reminderAdvanceDays),
      updatedAt: now
    };
    if (input.purchaseWay !== '朋友赠送') data.giftFrom = '';
    if (input.reminderIgnores && typeof input.reminderIgnores === 'object') {
      const ignores = {};
      ['water', 'fertilize', 'repot'].forEach((key) => {
        const value = day(input.reminderIgnores[key]);
        if (value) ignores[key] = value;
      });
      data.reminderIgnores = ignores;
    }
    if (Array.isArray(input.manualTasks)) {
      data.manualTasks = input.manualTasks.map((item, index) => ({
        id: text((item && item.id) || ('task_' + index), 64) || ('task_' + index),
        title: text(item && item.title, 40),
        done: !!(item && item.done),
        createdAt: day(item && item.createdAt) || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
      })).filter(item => item.title);
    }
    if (Array.isArray(input.tags)) data.tags = tagIds(input.tags);
    if (input.clientId) data.clientId = text(input.clientId, 64);

    let id = text(input.id, 64);
    if (id) {
      const current = await owned(db, 'plants', id, openid);
      if (!current) return fail('植物不存在或已被删除');
      await db.collection('plants').doc(id).update({ data });
    } else if (data.clientId) {
      const existing = await db.collection('plants').where({ _openid: openid, clientId: data.clientId }).limit(1).get();
      if (existing.data.length && existing.data[0].deleted) return fail('该录入项对应的植物已被删除，请重新生成草稿');
      if (existing.data.length && !existing.data[0].deleted) {
        id = existing.data[0]._id;
        if (data.clientId.indexOf('batch_') !== 0) await db.collection('plants').doc(id).update({ data });
      }
    }
    if (!id) {
      const document = Object.assign({
        _openid: openid,
        memorialized: false,
        deleted: false,
        createdAt: now
      }, data);
      if (data.clientId) {
        // 同一批量条目即使超时重试，也始终写入同一个文档。
        id = 'plant_' + crypto.createHash('sha256').update(openid + ':' + data.clientId).digest('hex').slice(0, 56);
        await db.collection('plants').doc(id).set({ data: document });
      } else {
        const added = await db.collection('plants').add({ data: document });
        id = added._id;
      }
    }
    const fresh = await db.collection('plants').doc(id).get();
    return ok({ plant: plantView(fresh.data) });
  } catch (error) {
    console.error('savePlant failed');
    return fail('保存植物失败，请稍后重试');
  }
};
