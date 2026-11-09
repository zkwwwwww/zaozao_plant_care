const format = require('./format');
const reminder = require('./reminder');

function taskKey(task) {
  return task.plantId + ':' + task.type + ':' + (task.taskId || '');
}

function summaryFor(bundle, today) {
  const groups = [
    { key: 'today', label: '今天待办', items: [] },
    { key: 'overdue', label: '已经逾期', items: [] },
    { key: 'upcoming', label: '未来两天', items: [] }
  ];
  (bundle.plants || []).forEach(plant => {
    if (plant.memorialized || plant.status === '死亡') return;
    ['water', 'fertilize', 'repot'].forEach(type => {
      const due = reminder.nextDueDate(plant, type);
      if (!due) return;
      const days = format.diffDays(today, due);
      if (days > 2) return;
      const task = { plantId: plant.id, plantName: plant.name, type, due, label: reminder.CARE_TYPE_NAME[type] };
      task.key = taskKey(task);
      task.text = days < 0 ? '逾期 ' + (-days) + ' 天' : days === 0 ? '今天到期' : days === 1 ? '明天到期' : '后天到期';
      groups[days < 0 ? 1 : days === 0 ? 0 : 2].items.push(task);
    });
    (plant.manualTasks || []).filter(task => !task.done && (!task.createdAt || task.createdAt <= today)).forEach(task => {
      const item = { plantId: plant.id, plantName: plant.name, type: 'manual', taskId: task.id, label: task.title, text: '手动任务', due: today };
      item.key = taskKey(item);
      groups[0].items.push(item);
    });
  });
  groups.forEach(group => {
    group.items.sort((a, b) => a.due.localeCompare(b.due));
    group.count = group.items.length;
  });
  return { groups, pending: groups[0].items.concat(groups[1].items), total: groups.reduce((sum, group) => sum + group.count, 0) };
}

function completed(task, bundle, today) {
  const plant = (bundle.plants || []).find(item => item.id === task.plantId);
  if (!plant) return false;
  if (task.type === 'manual') return (plant.manualTasks || []).some(item => item.id === task.taskId && item.done);
  return (plant.records || []).some(record => record.type === reminder.CARE_TYPE_NAME[task.type] && record.date === today);
}

function observe(previous, bundle, today) {
  const state = previous && previous.day === today
    ? Object.assign({}, previous)
    : { day: today, dailyShown: false, completedShown: false, targets: [] };
  const summary = summaryFor(bundle, today);
  const targets = new Map((state.targets || []).map(task => [taskKey(task), task]));
  summary.pending.forEach(task => targets.set(task.key, { plantId: task.plantId, type: task.type, taskId: task.taskId || '' }));
  state.targets = Array.from(targets.values());
  const done = state.targets.filter(task => completed(task, bundle, today)).length;
  return {
    state, summary, done, total: state.targets.length,
    allCompleted: state.targets.length > 0 && done === state.targets.length && !summary.pending.length
  };
}

module.exports = { summaryFor, observe, taskKey };
