const { execFileSync, spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseVersion, compareVersions } = require('../utils/version');

function validateRelease(pkg, releaseConfig, onlineVersion) {
  if (!parseVersion(onlineVersion)) throw new Error('Confirm the online version using --online-version major.minor.patch.');
  if (!releaseConfig || !parseVersion(releaseConfig.publishedBaseline)) {
    throw new Error('The confirmed production baseline is missing or invalid.');
  }
  if (compareVersions(onlineVersion, releaseConfig.publishedBaseline) < 0) {
    throw new Error('The online version cannot be below the confirmed production baseline.');
  }
  const records = releaseConfig.releases;
  const current = releaseConfig.current;
  if (!pkg || !parseVersion(pkg.version) || !current || !Array.isArray(records) || !records.length || !records[0]
    || pkg.version !== current.version || records[0].version !== current.version) {
    throw new Error('Package, current release and first release record must use the same version.');
  }
  if (compareVersions(pkg.version, onlineVersion) <= 0) {
    throw new Error('The upload version must be newer than the confirmed online version.');
  }
  records.forEach((record, index) => {
    if (!record || !parseVersion(record.version) || !Array.isArray(record.changes) || !record.changes.length) {
      throw new Error('Every release record needs a valid version and update notes.');
    }
    if (index && compareVersions(records[index - 1].version, record.version) <= 0) {
      throw new Error('Release records must have unique versions in descending order.');
    }
  });
  return pkg.version;
}

function buildUploadArgs(root, version, description, revision, branch, outputPath) {
  if (!parseVersion(version)) throw new Error('The upload version is invalid.');
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(revision)) throw new Error('A full Git commit is required.');
  if (typeof branch !== 'string' || !branch || branch === 'HEAD' || /[\r\n\0]/.test(branch)) {
    throw new Error('Upload from a named Git branch.');
  }
  if (typeof description !== 'string' || !description.trim()) throw new Error('Upload notes are required.');
  const notes = description.trim() + ' commit=' + revision + '; branch=' + branch;
  if (notes.length > 200) throw new Error('Upload notes, commit and branch must fit within 200 characters.');
  const args = ['upload', '--project', root, '--version', version, '--desc', notes, '--lang', 'zh'];
  if (outputPath) args.push('--info-output', resolve(outputPath));
  return args;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--check' || option === '--help') {
      options[option.slice(2)] = true;
      continue;
    }
    if (!['--online-version', '--desc', '--info-output'].includes(option)) {
      throw new Error('Unknown release option: ' + option + '. The upload version is read from the project.');
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--') || options[option]) throw new Error('Provide one value for ' + option + '.');
    options[option] = value;
    index += 1;
  }
  return options;
}

function main(args) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('Usage: npm run release:wechat -- --online-version X.Y.Z [--desc NOTES] [--info-output FILE]');
    console.log('Check only: npm run release:check -- --online-version X.Y.Z');
    console.log('Confirm the latest production and uploaded versions in WeChat before running.');
    return;
  }
  const root = resolve(__dirname, '..');
  const pkg = require('../package.json');
  const releaseConfig = require('../config/releases');
  const version = validateRelease(pkg, releaseConfig, options['--online-version']);
  console.log('Release checked: ' + version + ' > online ' + options['--online-version']);
  if (options.check) return;
  const git = input => execFileSync('git', input, { cwd: root, encoding: 'utf8' }).trim();
  // Local project instructions are deliberately not committed or uploaded.
  const changes = git(['status', '--porcelain', '--untracked-files=normal']).split('\n')
    .filter(line => line && line !== '?? AGENTS.md');
  if (changes.length) throw new Error('Commit the release files before uploading.');
  const revision = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const description = options['--desc'] || releaseConfig.current.changes.join(' ');
  const uploadArgs = buildUploadArgs(root, version, description, revision, branch, options['--info-output']);
  const cli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  if (!existsSync(cli)) throw new Error('The installed WeChat developer tools CLI was not found.');
  console.log('Uploading ' + version + ' from ' + branch + ' at ' + revision);
  const child = spawn(cli, uploadArgs, { cwd: root, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = !signal && typeof code === 'number' ? code : 1; });
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { parseVersion, compareVersions, validateRelease, buildUploadArgs, parseOptions };
