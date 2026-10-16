const { fail, ok, text, day, amount, openContext, ensure, owned } = require('./runtime');

const CATEGORIES = ['农资花费', '肥料', '药剂', '补光灯', '其他'];

function expenseView(doc) {
  return {
    id: doc._id,
    date: doc.date || '',
    category: doc.category || '',
    amount: doc.amount || 0,
    note: doc.note || ''
  };
}

async function save(db, openid, input) {
  const date = day(input.date);
  if (!date) return fail('请选择日期');
  if (CATEGORIES.indexOf(input.category) < 0) return fail('请选择类别');
  const value = amount(input.amount);
  if (value === '' || value <= 0) return fail('请输入大于 0 的金额');

  const now = db.serverDate();
  const data = { date, category: input.category, amount: value, note: text(input.note, 100), updatedAt: now };
  let id = text(input.id, 64);
  if (id) {
    if (!await owned(db, 'expenses', id, openid)) return fail('花费记录不存在或已被删除');
    await db.collection('expenses').doc(id).update({ data });
  } else {
    const added = await db.collection('expenses').add({
      data: Object.assign({ _openid: openid, deleted: false, createdAt: now }, data)
    });
    id = added._id;
  }
  const fresh = await db.collection('expenses').doc(id).get();
  return ok({ expense: expenseView(fresh.data) });
}

async function remove(db, openid, input) {
  const id = text(input.id, 64);
  if (!await owned(db, 'expenses', id, openid)) return fail('花费记录不存在或已被删除');
  await db.collection('expenses').doc(id).update({ data: { deleted: true, updatedAt: db.serverDate() } });
  return ok();
}

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const input = event || {};
  try {
    await ensure(ctx.db, 'expenses');
    if (input.action === 'delete') return await remove(ctx.db, ctx.openid, input);
    return await save(ctx.db, ctx.openid, input);
  } catch (error) {
    console.error('manageExpense failed');
    return fail(input.action === 'delete' ? '删除花费失败，请稍后重试' : '保存花费失败，请稍后重试');
  }
};
