const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const versions = require('../utils/version');
const { parseVersion, compareVersions, validateRelease, buildUploadArgs, parseOptions } = require('../scripts/wechat-release');

function releaseFixture(version = '1.2.3') {
  const current = { version, date: '2026-11-12', title: 'Updated garden', changes: ['Clearer reminders.'] };
  return {
    pkg: { version },
    config: {
      current,
      publishedBaseline: '1.2.2',
      releases: [current, { version: '1.1.3', date: '2026-11-10', title: 'Earlier update', changes: ['Clearer home page.'] }]
    }
  };
}

test('canonical release versions parse as safe numeric triples', () => {
  assert.equal(parseVersion, versions.parseVersion);
  assert.equal(compareVersions, versions.compareVersions);
  assert.deepEqual(parseVersion('0.0.0'), [0, 0, 0]);
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('10.20.300'), [10, 20, 300]);
  assert.deepEqual(parseVersion('9007199254740991.0.0'), [Number.MAX_SAFE_INTEGER, 0, 0]);
});

test('release parsing rejects noncanonical, malformed and unsafe versions', () => {
  for (const value of [
    undefined, null, 123, {}, '', '1', '1.2', '1.2.3.4', 'v1.2.3',
    '01.2.3', '1.02.3', '1.2.03', '1.2.-3', '-1.2.3', '+1.2.3',
    ' 1.2.3', '1.2.3 ', '1.2.3\n', '1.2.3-beta', '1.2.3+build',
    '1e1.2.3', '1.2.NaN', '9007199254740992.0.0', '1.9007199254740992.0', '1.2.9007199254740992'
  ]) {
    assert.equal(parseVersion(value), null, String(value));
  }
});

test('release comparison is numeric rather than lexical at every position', () => {
  for (const [older, newer] of [
    ['1.2.9', '1.2.10'], ['1.9.99', '1.10.0'], ['9.99.99', '10.0.0'],
    ['1.1.3', '1.2.2'], ['1.2.2', '1.2.3'], ['0.0.0', '0.0.1']
  ]) {
    assert.equal(compareVersions(older, newer), -1);
    assert.equal(compareVersions(newer, older), 1);
  }
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('9007199254740991.0.0', '9007199254740990.99.99'), 1);
});

test('comparison never silently accepts invalid version inputs', () => {
  for (const invalid of [undefined, '', '1.2', '01.2.3', '9007199254740992.0.0']) {
    assert.throws(() => compareVersions(invalid, '1.2.3'), /major\.minor\.patch/);
    assert.throws(() => compareVersions('1.2.3', invalid), /major\.minor\.patch/);
  }
});

test('notification version checks accept only genuinely newer canonical releases', () => {
  const { shouldNotifyRelease } = versions;
  assert.equal(shouldNotifyRelease('1.2.3', '1.2.2'), true);
  assert.equal(shouldNotifyRelease('1.2.3', '1.1.3'), true);
  assert.equal(shouldNotifyRelease('1.2.3', '1.2.3'), false);
  assert.equal(shouldNotifyRelease('1.2.3', '1.2.4'), false);
  assert.equal(shouldNotifyRelease('1.2.10', '1.2.9'), true);
  assert.equal(shouldNotifyRelease('1.2.9', '1.2.10'), false);
  for (const unseen of [undefined, null, '', 'unknown', '01.2.3']) {
    assert.equal(shouldNotifyRelease('1.2.3', unseen), true);
  }
  for (const invalid of [undefined, '', '1.2', '01.2.3', '9007199254740992.0.0']) {
    assert.equal(shouldNotifyRelease(invalid, '1.2.2'), false);
  }
});

test('the project release matches its changelog and never falls below the confirmed baseline', () => {
  const pkg = require('../package.json');
  const config = require('../config/releases');
  assert.equal(config.current.version, pkg.version);
  assert.equal(config.releases[0].version, pkg.version);
  const comparison = compareVersions(pkg.version, config.publishedBaseline);
  assert.ok(comparison >= 0);
  assert.match(config.current.date, /^\d{4}-\d{2}-\d{2}$/);
  if (comparison > 0) assert.equal(validateRelease(pkg, config, config.publishedBaseline), pkg.version);
  else assert.throws(() => validateRelease(pkg, config, config.publishedBaseline), /must be newer/);
  const fixture = releaseFixture();
  assert.equal(validateRelease(fixture.pkg, fixture.config, '1.2.2'), '1.2.3');
});

test('release validation requires an explicit canonical online version and confirmed baseline', () => {
  const { pkg, config } = releaseFixture();
  for (const online of [undefined, '', '1.2', '01.2.2', 122]) {
    assert.throws(() => validateRelease(pkg, config, online), /online version/);
  }
  for (const baseline of [undefined, '', '1.2', '01.2.2']) {
    assert.throws(() => validateRelease(pkg, Object.assign({}, config, { publishedBaseline: baseline }), '1.2.2'), /baseline/);
  }
  assert.throws(() => validateRelease(pkg, null, '1.2.2'), /baseline/);
});

test('online versions below the confirmed production baseline are rejected', () => {
  const { pkg, config } = releaseFixture('1.3.0');
  for (const online of ['1.1.3', '1.2.0', '1.2.1']) {
    assert.throws(() => validateRelease(pkg, config, online), /below the confirmed production baseline/);
  }
});

test('upload versions equal to or below the confirmed online version are rejected', () => {
  for (const version of ['1.2.2', '1.1.3']) {
    const { pkg, config } = releaseFixture(version);
    assert.throws(() => validateRelease(pkg, config, '1.2.2'), /must be newer/);
  }
  const { pkg, config } = releaseFixture();
  assert.throws(() => validateRelease(pkg, config, '1.2.3'), /must be newer/);
  assert.throws(() => validateRelease(pkg, config, '1.2.4'), /must be newer/);
});

test('package, current release and first record must have one matching version', () => {
  const { pkg, config } = releaseFixture();
  assert.throws(() => validateRelease({ version: '1.2.4' }, config, '1.2.2'), /same version/);
  assert.throws(() => validateRelease(pkg, Object.assign({}, config, { current: Object.assign({}, config.current, { version: '1.2.4' }) }), '1.2.2'), /same version/);
  assert.throws(() => validateRelease(pkg, Object.assign({}, config, { releases: [Object.assign({}, config.current, { version: '1.2.4' })] }), '1.2.2'), /same version/);
  assert.throws(() => validateRelease(null, config, '1.2.2'), /same version/);
  assert.throws(() => validateRelease(pkg, Object.assign({}, config, { current: null }), '1.2.2'), /same version/);
  assert.throws(() => validateRelease(pkg, Object.assign({}, config, { releases: [] }), '1.2.2'), /same version/);
});

test('release records need update notes and unique descending numeric versions', () => {
  const { pkg, config } = releaseFixture();
  const first = config.releases[0];
  for (const record of [null, { version: '1.2' }, { version: '1.1.3', changes: [] }]) {
    assert.throws(() => validateRelease(pkg, Object.assign({}, config, { releases: [first, record] }), '1.2.2'), /valid version and update notes/);
  }
  for (const version of ['1.2.3', '1.2.4']) {
    assert.throws(() => validateRelease(pkg, Object.assign({}, config, { releases: [first, { version, changes: ['An update.'] }] }), '1.2.2'), /unique versions in descending order/);
  }
  const numeric = releaseFixture('1.2.10');
  numeric.config.releases[1] = { version: '1.2.9', changes: ['Earlier update.'] };
  assert.equal(validateRelease(numeric.pkg, numeric.config, '1.2.2'), '1.2.10');
});

test('official upload arguments preserve validated version, full commit and named branch', () => {
  const { pkg, config } = releaseFixture();
  const version = validateRelease(pkg, config, '1.2.2');
  const root = path.resolve(__dirname, '..');
  const revision = '0123456789abcdef0123456789abcdef01234567';
  const branch = 'codex/release-1.2.3';
  const description = ' Clearer reminders and home page. ';
  const output = path.resolve('/private/tmp', 'wechat-release-test-info.json');
  assert.deepEqual(buildUploadArgs(root, version, description, revision, branch, output), [
    'upload', '--project', root, '--version', pkg.version,
    '--desc', 'Clearer reminders and home page. commit=' + revision + '; branch=' + branch,
    '--lang', 'zh', '--info-output', output
  ]);
  const withoutOutput = buildUploadArgs(root, version, 'Clearer home page.', revision, branch);
  assert.equal(withoutOutput.includes('--info-output'), false);
  assert.equal(withoutOutput[withoutOutput.indexOf('--version') + 1], config.current.version);
});

test('upload arguments reject invalid versions, abbreviated commits and ambiguous branches', () => {
  const root = path.resolve(__dirname, '..');
  const revision = 'a'.repeat(40);
  const build = (version = '1.2.3', commit = revision, branch = 'codex/release', description = 'Updated garden.') => buildUploadArgs(root, version, description, commit, branch);
  assert.throws(() => build('01.2.3'), /version is invalid/);
  assert.throws(() => build('1.2.3', 'abcdef0'), /full Git commit/);
  assert.throws(() => build('1.2.3', 'g'.repeat(40)), /full Git commit/);
  for (const branch of ['', 'HEAD', null, 'codex/release\nother', 'codex/release\0other']) {
    assert.throws(() => build('1.2.3', revision, branch), /named Git branch/);
  }
  assert.throws(() => build('1.2.3', revision, 'codex/release', ' '), /notes are required/);
  assert.throws(() => build('1.2.3', revision, 'codex/release', 'x'.repeat(200)), /within 200 characters/);
  assert.ok(build('1.2.3', 'a'.repeat(64)).includes('1.2.3'));
});

test('release CLI accepts online confirmation but never a separate upload-version override', () => {
  assert.deepEqual(parseOptions(['--check', '--online-version', '1.2.2']), { check: true, '--online-version': '1.2.2' });
  assert.deepEqual(parseOptions(['--online-version', '1.2.2', '--desc', 'Updated garden.', '--info-output', '/private/tmp/release-info.json']), {
    '--online-version': '1.2.2', '--desc': 'Updated garden.', '--info-output': '/private/tmp/release-info.json'
  });
  assert.throws(() => parseOptions(['--version', '1.2.4']), /version is read from the project/);
  assert.throws(() => parseOptions(['--online-version', '1.2.2', '--online-version', '1.2.3']), /one value/);
  assert.throws(() => parseOptions(['--online-version']), /one value/);
  const pkg = require('../package.json');
  assert.equal(pkg.scripts['release:check'], 'node scripts/wechat-release.js --check');
  assert.equal(pkg.scripts['release:wechat'], 'node scripts/wechat-release.js');
});
