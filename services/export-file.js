function downloadExport(payload) {
  if (!payload || !payload.fileID || !payload.downloadUrl || !/\.xlsx$/i.test(payload.fileName || '')) {
    return Promise.reject(new Error('导出功能尚未更新，请联系维护者更新后重试'));
  }
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: payload.downloadUrl,
      success: result => {
        if (result.statusCode !== 200 || !result.tempFilePath) return reject(new Error('表格下载失败，请重试'));
        resolve({ path: result.tempFilePath, name: payload.fileName, sheetCount: payload.sheetCount, rowCount: payload.rowCount });
      },
      fail: () => reject(new Error('表格下载失败，请检查网络或联系维护者确认下载权限'))
    });
  });
}

function openExport(file) {
  return new Promise((resolve, reject) => wx.openDocument({ filePath: file.path, fileType: 'xlsx', showMenu: true,
    success: resolve, fail: () => reject(new Error('无法预览表格，可点击“发送到微信”后用 Excel 或 WPS 打开')) }));
}

function shareExport(file) {
  if (!wx.shareFileMessage || wx.canIUse && !wx.canIUse('shareFileMessage')) {
    wx.showModal({ title: '当前微信不支持直接发送文件', content: '请打开表格，使用右上角菜单保存或转发，或升级微信后再试。', showCancel: false });
    return;
  }
  wx.shareFileMessage({ filePath: file.path, fileName: file.name,
    fail: error => { if (!/cancel/i.test(error.errMsg || '')) wx.showToast({ title: '发送失败，请打开表格后通过菜单转发', icon: 'none' }); } });
}

module.exports = { downloadExport, openExport, shareExport };
