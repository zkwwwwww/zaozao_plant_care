// app.js
App({
  onLaunch() {
    // 初始化：写入默认环境分类（如果还没有任何数据）
    const envs = wx.getStorageSync('envs');
    if (!envs || !Array.isArray(envs) || envs.length === 0) {
      const defaults = [
        { id: 'env_1', name: '室内明亮', lightIntensity: '5000', lightHours: '8' },
        { id: 'env_2', name: '半阴散射光', lightIntensity: '3000', lightHours: '6' },
        { id: 'env_3', name: '阳台直射', lightIntensity: '8000', lightHours: '10' },
        { id: 'env_4', name: '弱光阴处', lightIntensity: '1500', lightHours: '4' }
      ];
      wx.setStorageSync('envs', defaults);
    }
  },

  globalData: {}
});
