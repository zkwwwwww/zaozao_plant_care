const SHARE_TITLE = '植早早，记下每一株植物的生长与陪伴';

function shareMessage() {
  return { title: SHARE_TITLE, path: '/pages/share/share', imageUrl: '/assets/icons/logo.png' };
}

function shareTimeline() {
  // Timeline cannot change the landing page; use a public preview on every route.
  return { title: SHARE_TITLE, query: 'appShare=1', imageUrl: '/assets/icons/logo.png' };
}

function clientEntry(providerName) {
  try {
    const provider = wx[providerName];
    const options = provider && provider.call(wx);
    if (options && typeof options.scene === 'number') return options;
  } catch (error) { /* Older clients may not expose entry options. */ }
  return null;
}

function entryOptions() {
  const current = clientEntry('getEnterOptionsSync');
  if (current) return current;
  let app;
  try { app = typeof getApp === 'function' && getApp(); }
  catch (error) { /* The app may not be ready during page registration. */ }
  const knownEntry = app && app.globalData && app.globalData.entryOptions;
  // Launch options stay unchanged after an older client enters the full app.
  if (knownEntry && typeof knownEntry.scene === 'number') return knownEntry;
  const launch = clientEntry('getLaunchOptionsSync');
  if (launch) return launch;
  return app && app.globalData && app.globalData.singlePage ? { scene: 1154 } : {};
}

function isSinglePage() {
  return entryOptions().scene === 1154;
}

function enableShare() {
  if (typeof wx === 'undefined' || !wx.showShareMenu) return;
  const friends = () => {
    try { wx.showShareMenu({ menus: ['shareAppMessage'], fail: () => {} }); }
    catch (error) { /* Sharing may not be supported by the current client. */ }
  };
  try {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail: friends });
  } catch (error) { friends(); }
}

function shareHelp() {
  let platform = '';
  try { platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform; } catch (error) { /* Older clients may omit device information. */ }
  wx.showModal({ title: '分享整个小程序', showCancel: false,
    content: (platform === 'devtools' ? '开发者工具中的转发只是模拟，不会真的发给朋友。请用手机微信打开体验版或正式版测试。\n\n' : '') +
      '在任意页面点击右上角“···”，选择“发送给朋友”或“分享到朋友圈”。页面上的“分享植早早”按钮也能发送给朋友。分享只展示应用介绍，不会公开你的植物、价格或记录。朋友圈分享需使用支持该功能的微信版本。' });
}

function definePage(definition) {
  const onLoad = definition.onLoad;
  const onShow = definition.onShow;
  const entry = entryOptions();
  const initialSinglePage = entry.scene === 1154;
  // Hide business components before their attached hooks can run in a preview.
  const initialPreview = initialSinglePage || !!(entry.query && entry.query.appShare === '1');
  const page = Object.assign({}, definition, {
    data: Object.assign({}, definition.data, { appSharePreview: initialPreview, appShareSinglePage: initialSinglePage }),
    onLoad(options) {
      const pageOptions = options || {};
      const singlePage = isSinglePage();
      this._appSharePreview = singlePage || pageOptions.appShare === '1';
      enableShare();
      if (this.data.appSharePreview !== this._appSharePreview || this.data.appShareSinglePage !== singlePage) {
        this.setData({ appSharePreview: this._appSharePreview, appShareSinglePage: singlePage });
      }
      if (this._appSharePreview) return;
      return onLoad && onLoad.call(this, pageOptions);
    },
    onShow() {
      const singlePage = isSinglePage();
      enableShare();
      if (singlePage || this.data.appSharePreview) this._appSharePreview = true;
      if (this._appSharePreview) {
        this.setData({ appSharePreview: true, appShareSinglePage: singlePage });
        return;
      }
      return onShow && onShow.apply(this, arguments);
    },
    onShareAppMessage: shareMessage,
    onShareTimeline: shareTimeline,
    showShareHelp: shareHelp
  });
  const lifecycles = ['onReady', 'onHide', 'onUnload', 'onPullDownRefresh', 'onReachBottom', 'onPageScroll', 'onResize', 'onTabItemTap', 'onSaveExitState'];
  lifecycles.forEach(name => {
    const handler = definition[name];
    if (typeof handler !== 'function') return;
    page[name] = function () {
      if (this._appSharePreview || this.data.appSharePreview) return;
      return handler.apply(this, arguments);
    };
  });
  return Page(page);
}

module.exports = definePage;
module.exports.shareMessage = shareMessage;
module.exports.shareTimeline = shareTimeline;
module.exports.isSinglePage = isSinglePage;
