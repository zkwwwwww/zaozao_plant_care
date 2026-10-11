const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const NICK_MAX = 32;

function normalizeNickName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NICK_MAX);
}

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

async function ensureUsers(db) {
  try {
    await db.createCollection('users');
  } catch (error) {
    const text = JSON.stringify(error || {});
    if (!/exist|已存在|ResourceExist|-501001|-502002/i.test(text)) throw error;
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { ok: false, message: '未获取到微信用户身份' };

  const db = cloud.database();
  const nickName = normalizeNickName(event && event.nickName);
  const avatarFileId = isCloudFileId(event && event.avatarFileId) ? event.avatarFileId : '';

  try {
    await ensureUsers(db);
    const users = db.collection('users');
    const now = db.serverDate();
    const existing = await users.where({ _openid: openid }).limit(1).get();
    if (!existing.data.length) {
      await users.add({
        data: {
          _openid: openid,
          nickName,
          avatarUrl: avatarFileId,
          migrationStatus: 'pending',
          createdAt: now,
          updatedAt: now
        }
      });
    } else if (nickName || avatarFileId) {
      const patch = { updatedAt: now };
      if (nickName) patch.nickName = nickName;
      if (avatarFileId) patch.avatarUrl = avatarFileId;
      await users.doc(existing.data[0]._id).update({ data: patch });
    }

    const fresh = await users.where({ _openid: openid }).limit(1).get();
    const user = fresh.data[0] || {};
    return {
      ok: true,
      openid,
      appid: wxContext.APPID || '',
      user: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        migrationStatus: user.migrationStatus || 'pending'
      }
    };
  } catch (error) {
    console.error('login failed');
    return { ok: false, message: '保存账号失败，请稍后重试' };
  }
};
