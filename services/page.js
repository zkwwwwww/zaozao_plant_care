const SHARE_TITLE = '植早早，记下每一株植物的生长与陪伴';

function shareMessage() {
  return { title: SHARE_TITLE, path: '/pages/share/share', imageUrl: '/assets/icons/logo.png' };
}

function enableShare(timeline) {
  if (!wx.showShareMenu) return;
  const friends = () => wx.showShareMenu({ menus: ['shareAppMessage'], fail: () => {} });
  try {
    wx.showShareMenu({ menus: timeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'], fail: friends });
  } catch (error) { try { friends(); } catch (fallbackError) { /* Sharing may not be supported by the current client. */ } }
}

function shareHelp() {
  let platform = '';
  try { platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform; } catch (error) { /* Older clients may omit device information. */ }
  wx.showModal({ title: '分享整个小程序', showCancel: false,
    content: (platform === 'devtools' ? '开发者工具中的转发只是模拟，不会真的发给朋友。请用手机微信打开体验版或正式版测试。\n\n' : '') +
      '点击“分享植早早”会发送小程序卡片，朋友打开后看到应用介绍，不会看到你的植物、价格或记录。朋友圈分享请打开“应用介绍”后使用右上角菜单；需使用支持该功能的微信版本。' });
}

function definePage(definition) {
  const onLoad = definition.onLoad;
  const onShow = definition.onShow;
  const page = Object.assign({}, definition, {
    onLoad(options) {
      enableShare(!!definition.onShareTimeline);
      return onLoad && onLoad.call(this, options || {});
    },
    onShow() {
      enableShare(!!definition.onShareTimeline);
      return onShow && onShow.call(this);
    },
    onShareAppMessage: shareMessage,
    showShareHelp: shareHelp
  });
  if (definition.onShareTimeline) page.onShareTimeline = definition.onShareTimeline;
  return Page(page);
}

module.exports = definePage;
module.exports.shareMessage = shareMessage;
