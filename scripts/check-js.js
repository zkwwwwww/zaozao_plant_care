const { execFileSync } = require('node:child_process');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = join(__dirname, '..');
const ignored = new Set(['node_modules', 'miniprogram_npm', 'cloudfunctions']);
const jsFiles = [];
const jsonFiles = [];
const wxmlFiles = [];

function collect(dir) {
  readdirSync(dir).forEach(name => {
    if (ignored.has(name)) return;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) collect(path);
    else if (name.endsWith('.js')) jsFiles.push(path);
    else if (name.endsWith('.json')) jsonFiles.push(path);
    else if (name.endsWith('.wxml')) wxmlFiles.push(path);
  });
}

collect(root);
jsFiles.forEach(file => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }));
jsonFiles.forEach(file => JSON.parse(readFileSync(file, 'utf8')));

wxmlFiles.forEach(file => {
  const source = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const voidTags = new Set(['input']);
  for (const match of source.matchAll(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g)) {
    const token = match[0];
    const tag = match[1];
    if (token.startsWith('</')) {
      const opened = stack.pop();
      if (opened !== tag) {
        throw new Error(`${relative(root, file)}: expected </${opened}> but found </${tag}>`);
      }
    } else if (!token.endsWith('/>') && !voidTags.has(tag)) {
      stack.push(tag);
    }
  }
  if (stack.length) {
    throw new Error(`${relative(root, file)}: unclosed <${stack[stack.length - 1]}>`);
  }
});

console.log(
  `Static checks passed (${jsFiles.length} JS, ${jsonFiles.length} JSON, ${wxmlFiles.length} WXML files).`
);
