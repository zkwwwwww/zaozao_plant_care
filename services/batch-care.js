const { uniqueId } = require('../utils/id');
const format = require('../utils/format');
const TYPE_NAMES = { water: '浇水', fertilize: '施肥', repot: '换盆' };

async function completeTasks(tasks, call, options) {
  const settings = options || {};
  const requestId = settings.requestId || uniqueId('care');
  const date = settings.date || format.today();
  const results = [];
  let message = '';
  const seen = new Set();
  const source = tasks.filter(task => {
    const signature = JSON.stringify([task.plantId, task.type, task.taskId || '']);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  for (let i = 0; i < source.length; i += 100) {
    const chunk = source.slice(i, i + 100);
    try {
      const result = await call('batchCare', {
        tasks: chunk.map(task => ({
          key: task.key, plantId: task.plantId, type: TYPE_NAMES[task.type] || task.type, taskId: task.taskId || ''
        })), requestId, date
      });
      if (!Array.isArray(result.results)) throw new Error('请先更新云端的批量养护功能');
      chunk.forEach(task => {
        const item = result.results.find(row => row.key === task.key);
        results.push(item && ['saved', 'skipped', 'failed'].includes(item.status) ? item : { key: task.key, status: 'failed' });
      });
    } catch (error) {
      message = message || error.message || '网络异常，请重试';
      chunk.forEach(task => results.push({ key: task.key, status: 'failed' }));
    }
    if (settings.onProgress) settings.onProgress({ processed: results.length, total: source.length });
  }
  return {
    saved: results.filter(item => item.status === 'saved').length,
    failed: results.filter(item => item.status === 'failed').length,
    skipped: results.filter(item => item.status === 'skipped').length, results, message
  };
}

module.exports = { completeTasks };
