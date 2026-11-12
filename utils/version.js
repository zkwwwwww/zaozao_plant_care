function parseVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error('Versions must use major.minor.patch with non-negative integers.');
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function shouldNotifyRelease(current, lastSeen) {
  if (!parseVersion(current)) return false;
  return !parseVersion(lastSeen) || compareVersions(current, lastSeen) > 0;
}

module.exports = { parseVersion, compareVersions, shouldNotifyRelease };
