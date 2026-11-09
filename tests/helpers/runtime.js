const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function loadScript(file, mocks, globals) {
  const filename = path.resolve(__dirname, '../..', file);
  const nativeRequire = createRequire(filename);
  const context = Object.assign({
    console, setTimeout, clearTimeout,
    exports: {},
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name)
  }, globals);
  context.module = { exports: context.exports };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context;
}

function fakeWx() {
  const storage = new Map();
  return {
    storage,
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
    showLoading() {}, hideLoading() {}, showToast() {}, switchTab() {},
    showModal: options => options.success({ confirm: true })
  };
}

function loadPage(file, mocks, wx) {
  let page;
  loadScript(file, Object.assign({}, mocks, {
    '../../services/page': definition => { page = definition; }
  }), { wx, setTimeout() {} });
  page.data = structuredClone(page.data);
  page.setData = partial => {
    Object.entries(partial).forEach(([key, value]) => {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let current = page.data;
      keys.slice(0, -1).forEach(part => { current = current[part]; });
      current[keys[keys.length - 1]] = value;
    });
  };
  return page;
}

module.exports = { loadScript, loadPage, fakeWx };
