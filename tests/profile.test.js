const test = require('node:test');
const assert = require('node:assert/strict');
const profile = require('../utils/profile');

test('normalizeNickName trims, strips controls and limits length', () => {
  assert.equal(profile.normalizeNickName('  早早  '), '早早');
  assert.equal(profile.normalizeNickName('a\u0000b'), 'ab');
  assert.equal(profile.normalizeNickName('a'.repeat(40)).length, 32);
  assert.equal(profile.normalizeNickName(''), '');
});

test('session cache expires after seven days', () => {
  const now = 1_700_000_000_000;
  const fresh = { authorized: true, loggedInAt: now, expiresAt: now + profile.SESSION_TTL_MS };
  assert.equal(profile.sessionStatus(fresh, now), 'valid');
  assert.equal(profile.sessionStatus(fresh, fresh.expiresAt), 'expired');
  assert.equal(profile.sessionStatus({ authorized: true, loggedInAt: now - profile.SESSION_TTL_MS }, now), 'expired');
  assert.equal(profile.sessionStatus({ authorized: false, expiresAt: now + 1000 }, now), 'anonymous');
});

test('cloud file ids and openid masks stay stable', () => {
  assert.equal(profile.isCloudFileId('cloud://prod/avatars/a.jpg'), true);
  assert.equal(profile.isCloudFileId('wxfile://tmp_1'), false);
  assert.equal(profile.maskOpenId('o6zAJs9_K-Bo6MsA'), '当前微信 ···6MsA');
  assert.equal(profile.maskOpenId('short'), '已绑定当前微信');
});
