const { fail, ok, text, openContext, ensure, owned } = require('./runtime');

exports.main = async (event) => {
  const ctx = await openContext();
  if (ctx.error) return ctx.error;
  const id = text(event && event.id, 64);
  if (!id) return fail('缺少记录');
  try {
    await ensure(ctx.db, 'care_records');
    if (!await owned(ctx.db, 'care_records', id, ctx.openid)) return fail('记录不存在或已被删除');
    await ctx.db.collection('care_records').doc(id).update({
      data: { deleted: true, updatedAt: ctx.db.serverDate() }
    });
    return ok();
  } catch (error) {
    console.error('deleteRecord failed');
    return fail('删除记录失败，请稍后重试');
  }
};
