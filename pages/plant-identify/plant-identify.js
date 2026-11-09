const account = require('../../services/account');
const media = require('../../utils/media');

// Agent API 就绪后替换此函数
function mockIdentify() {
  return Promise.resolve({
    name: '待识别植物',
    desc: '识别服务尚未接入，以下为示意建议，不阻断后续建档。',
    tips: [
      { label: '配土', text: '疏水透气的颗粒土或泥炭混合珍珠岩' },
      { label: '光线', text: '明亮散射光，避免正午暴晒' },
      { label: '浇水', text: '见干见湿，盆土上层干燥后再浇' },
      { label: '通风', text: '保持空气流通，潮湿季节注意防闷' }
    ]
  });
}

const definePage = require('../../services/page');

definePage({
  data: {
    photo: '',
    loading: false,
    result: null
  },

  onShow() {
    account.requireLogin();
  },

  pickPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        try {
          const photo = await media.saveImage(res.tempFiles[0].tempFilePath);
          this.setData({ photo, result: null });
        } catch (error) {
          wx.showToast({ title: '照片保存失败', icon: 'none' });
        }
      }
    });
  },

  async runIdentify() {
    if (!this.data.photo || this.data.loading) return;
    this.setData({ loading: true });
    try {
      // TODO: 替换为真实 Agent / 识别 API，入参可用 this.data.photo
      const result = await mockIdentify(this.data.photo);
      this.setData({ result });
    } catch (error) {
      wx.showToast({ title: error.message || '识别失败，可手动建档', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  savePlant() {
    if (!account.requireLogin()) { account.promptLogin(); return; }
    wx.navigateTo({ url: '/pages/plant-edit/plant-edit?photo=' + encodeURIComponent(this.data.photo) });
  }
});
