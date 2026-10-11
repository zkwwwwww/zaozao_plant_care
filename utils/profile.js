const NICK_MAX = 32;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionStatus(session, now) {
  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (!session || session.authorized !== true) return 'anonymous';
  const expiresAt = Number(session.expiresAt);
  if (Number.isFinite(expiresAt)) return current < expiresAt ? 'valid' : 'expired';
  const loggedInAt = Number(session.loggedInAt);
  if (!Number.isFinite(loggedInAt)) return 'expired';
  return current - loggedInAt < SESSION_TTL_MS ? 'valid' : 'expired';
}

function normalizeNickName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, NICK_MAX);
}

function isCloudFileId(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0;
}

function maskOpenId(openid) {
  const text = String(openid || '');
  if (text.length < 8) return '已绑定当前微信';
  return '当前微信 ···' + text.slice(-4);
}

module.exports = {
  NICK_MAX,
  SESSION_TTL_MS,
  sessionStatus,
  normalizeNickName,
  isCloudFileId,
  maskOpenId
};
