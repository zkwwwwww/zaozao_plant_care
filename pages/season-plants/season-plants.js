const account = require('../../services/account');
const reminder = require('../../utils/reminder');

const REGIONS = ['华东', '华南', '华北', '西南', '西北', '东北'];
const LIBRARY = {
  春: [
    { name: '绿萝', place: '室内', tip: '耐阴，适合缓苗后水培或土培' },
    { name: '长寿花', place: '室内', tip: '日照充足处开花更稳' },
    { name: '吊兰', place: '室内', tip: '分株繁殖容易，春季正合适' }
  ],
  夏: [
    { name: '龟背竹', place: '室内', tip: '遮强光，保持通风' },
    { name: '虎尾兰', place: '室内', tip: '耐干，浇水宁少勿多' },
    { name: '白掌', place: '室内', tip: '喜湿润空气，避开暴晒' }
  ],
  秋: [
    { name: '多肉拼盘', place: '室外', tip: '昼夜温差大利于上色' },
    { name: '琴叶榕', place: '室内', tip: '稳定光照，少搬动' },
    { name: '蝴蝶兰', place: '室内', tip: '秋冬可追花芽，忌积水' }
  ],
  冬: [
    { name: '金琥', place: '室内', tip: '控水保温，南向窗台更佳' },
    { name: '玉露', place: '室内', tip: '明亮散射光，少浇' },
    { name: '常春藤', place: '室内', tip: '耐阴，适合冬季补绿' }
  ]
};

const definePage = require('../../services/page');

definePage({
  data: {
    regions: REGIONS,
    regionIndex: 0,
    region: REGIONS[0],
    season: reminder.currentSeason(),
    items: []
  },

  onShow() {
    this.render();
  },

  onRegion(e) {
    const regionIndex = Number(e.detail.value);
    this.setData({ regionIndex, region: REGIONS[regionIndex] });
    this.render();
  },

  render() {
    const season = reminder.currentSeason();
    const items = (LIBRARY[season.name] || []).map(item => Object.assign({ season: season.name + '季' }, item));
    this.setData({ season, items });
  },

  quickAdd(e) {
    if (!account.requireLogin()) { account.promptLogin(); return; }
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({
      url: '/pages/plant-edit/plant-edit?name=' + encodeURIComponent(name)
    });
  }
});
