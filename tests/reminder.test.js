const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../utils/format');
const reminder = require('../utils/reminder');

function plant(overrides) {
  return {
    purchaseDate: format.today(),
    companionStart: '',
    records: [],
    customWaterInterval: 5,
    customFertInterval: 30,
    customRepotInterval: 365,
    ...overrides
  };
}

test('nextDueDate uses latest matching record', () => {
  const p = plant({
    records: [
      { type: '浇水', date: '2026-01-02' },
      { type: '浇水', date: '2026-01-05' },
      { type: '施肥', date: '2026-01-08' }
    ]
  });
  assert.equal(reminder.nextDueDate(p, 'water'), '2026-01-10');
});

test('plantTasks includes upcoming tasks in the configured window', () => {
  const p = plant({ purchaseDate: format.today(), customWaterInterval: 5 });
  const tasks = reminder.plantTasks(p, { upcomingDays: 7 });
  assert.ok(tasks.some(task => task.type === 'water' && task.dueText === '还有 5 天'));
});

test('plant reminder defaults to one day early and supports per-plant override', () => {
  const tomorrow = plant({ purchaseDate: format.today(), customWaterInterval: 1 });
  assert.ok(reminder.plantTasks(tomorrow).some(task => task.type === 'water'));

  const inThreeDays = plant({ purchaseDate: format.today(), customWaterInterval: 3 });
  assert.equal(reminder.plantTasks(inThreeDays).some(task => task.type === 'water'), false);
  assert.ok(reminder.plantTasks({ ...inThreeDays, reminderAdvanceDays: 3 }).some(task => task.type === 'water'));
  assert.equal(reminder.reminderAdvanceDaysFor({ reminderAdvanceDays: 99 }), 30);
});

test('plantTasks excludes distant future tasks but always keeps overdue tasks', () => {
  const distant = plant({ purchaseDate: format.today(), customWaterInterval: 20 });
  assert.equal(reminder.plantTasks(distant, { upcomingDays: 7 }).some(t => t.type === 'water'), false);

  const overdue = plant({
    purchaseDate: format.addDays(format.today(), -20),
    customWaterInterval: 5
  });
  assert.equal(reminder.plantTasks(overdue, { upcomingDays: 0 }).some(t => t.type === 'water' && t.overdue), true);
});

test('plantTasks skips plants without a valid base date', () => {
  assert.deepEqual(reminder.plantTasks(plant({ purchaseDate: '', companionStart: '' })), []);
});
