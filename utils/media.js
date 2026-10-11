function saveImage(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: result => resolve(result.savedFilePath),
      fail: reject
    });
  });
}

async function saveImages(tempFilePaths) {
  const results = await Promise.allSettled(tempFilePaths.map(saveImage));
  return {
    savedPaths: results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value),
    failedCount: results.filter(result => result.status === 'rejected').length
  };
}

module.exports = {
  saveImage,
  saveImages
};
