// 模拟数据定义。所有日期都写成「距今天的天数」，写入时换算成中国时区日期
// records: [类型, 几天前, 内容, 是否带图]

const envs = [
  { key: 'balcony', name: '南阳台直射', lightIntensity: 30000, lightHours: 6 },
  { key: 'living', name: '客厅散射光', lightIntensity: 6000, lightHours: 8 },
  { key: 'shelf', name: '书房补光架', lightIntensity: 12000, lightHours: 12 },
  { key: 'bath', name: '卫生间弱光', lightIntensity: 800, lightHours: 4 }
];

const tags = [
  { key: 'foliage', name: '观叶' },
  { key: 'succulent', name: '多肉' },
  { key: 'flower', name: '开花' },
  { key: 'fern', name: '蕨类' },
  { key: 'sale', name: '待出售' }
];

const plants = [
  {
    key: 'monstera', name: '龟背竹', variety: '大叶原种', status: '健康', price: 168, purchaseWay: '实体花市',
    planting: '土培', env: 'living', location: '客厅落地窗边', bought: 420, tags: ['foliage'],
    water: 7, fert: 30, repot: 365, images: ['monstera'],
    description: '新叶已经开背，记得转盆让受光均匀。',
    records: [['浇水', 10, '浇透', true], ['浇水', 17, ''], ['施肥', 20, '稀释液肥'], ['换盆', 200, '换成 25cm 盆', true], ['修剪', 60, '剪掉黄叶']]
  },
  {
    key: 'fiddle', name: '琴叶榕', variety: '高杆', status: '待观察', price: 128, purchaseWay: '线上网店',
    planting: '土培', env: 'living', location: '沙发旁', bought: 400, tags: ['foliage'],
    water: 10, fert: 30, repot: 365, images: ['fiddle'],
    description: '最近掉了两片底叶，观察中。',
    records: [['浇水', 1, ''], ['施肥', 25, ''], ['测量', 30, '株高 112cm']]
  },
  {
    key: 'staghorn', name: '鹿角蕨', variety: '二歧', status: '健康', price: 268, purchaseWay: '朋友赠送',
    planting: '板植', env: 'bath', location: '浴室墙面', bought: 300, tags: ['fern'],
    water: 4, fert: 45, repot: 730, images: ['staghorn'],
    description: '上板第二年，盾叶长得很好。',
    records: [['浇水', 2, '泡水 10 分钟', true], ['施肥', 40, '']]
  },
  {
    key: 'boston', name: '波士顿蕨', variety: '', status: '病害', price: 35, purchaseWay: '花店',
    planting: '土培', env: 'bath', location: '洗手台', bought: 150, tags: ['fern'],
    water: 3, fert: 30, repot: 365, images: ['boston'],
    description: '叶尖发褐，疑似根腐，已控水。',
    records: [['浇水', 6, ''], ['防治病虫害', 3, '喷多菌灵']]
  },
  {
    key: 'snake', name: '虎尾兰', variety: '金边', status: '休眠', price: 29.9, purchaseWay: '网购拼团',
    planting: '颗粒', env: 'living', location: '玄关', bought: 600, tags: ['foliage'],
    water: 30, fert: 60, repot: 730, images: ['snake'],
    description: '入秋后基本不浇水。',
    records: [['浇水', 25, '少量']]
  },
  {
    key: 'pothos', name: '绿萝', variety: '青叶', status: '健康', price: 19.9, purchaseWay: '实体花市',
    planting: '水培', env: 'shelf', location: '书桌', bought: 200, tags: [],
    water: 7, fert: 30, repot: 365, images: ['pothos'],
    description: '水培换水算浇水。',
    records: [['浇水', 7, '换水'], ['施肥', 30, '营养液']]
  },
  {
    key: 'spider', name: '吊兰', variety: '金心', status: '健康', price: '', purchaseWay: '自己繁育',
    planting: '土培', env: 'balcony', location: '阳台吊篮', bought: 250, tags: [],
    water: 6, fert: 30, repot: 365, images: ['spider'],
    description: '从老株分出来的，没花钱。',
    records: [['浇水', 3, '']]
  },
  {
    key: 'peace', name: '白掌', variety: '', status: '虫害', price: 25, purchaseWay: '花店',
    planting: '土培', env: 'living', location: '电视柜', bought: 180, tags: ['flower'],
    water: 5, fert: 30, repot: 365, images: ['peace'],
    description: '叶背发现红蜘蛛。',
    records: [['浇水', 4, ''], ['防治病虫害', 1, '喷阿维菌素', true]]
  },
  {
    key: 'orchid', name: '蝴蝶兰', variety: '大白花', status: '健康', price: 88.8, purchaseWay: '花店',
    planting: '水苔', env: 'shelf', location: '书架二层', bought: 120, tags: ['flower'],
    water: 8, fert: 20, repot: 365, images: ['orchid'],
    description: '花期快结束，准备剪花梗。',
    records: [['浇水', 5, ''], ['施肥', 22, '兰花专用肥']]
  },
  {
    key: 'kalanchoe', name: '长寿花', variety: '重瓣橙', status: '健康', price: 15.5, purchaseWay: '实体花市',
    planting: '土培', env: 'balcony', location: '阳台花架', bought: 90, tags: ['flower', 'succulent'],
    water: 9, fert: 30, repot: 365, images: ['kalanchoe'],
    description: '',
    records: [['浇水', 8, '']]
  },
  {
    key: 'barrel', name: '金琥', variety: '短刺', status: '健康', price: 45, purchaseWay: '线上网店',
    planting: '颗粒', env: 'balcony', location: '阳台窗台', bought: 500, tags: ['succulent'],
    water: 20, fert: 60, repot: 730, images: ['barrel'],
    description: '晒足太阳，刺色很亮。',
    records: [['浇水', 12, '']]
  },
  {
    key: 'haworthia', name: '玉露', variety: '姬玉露', status: '待观察', price: 22, purchaseWay: '网购拼团',
    planting: '颗粒', env: 'shelf', location: '补光灯下', bought: 160, tags: ['succulent'],
    water: 12, fert: 60, repot: 365, images: ['haworthia'],
    description: '窗面有点发黄，调远了补光灯。',
    records: [['浇水', 13, ''], ['测量', 15, '冠幅 4.5cm']]
  },
  {
    key: 'bearpaw', name: '熊童子', variety: '黄熊', status: '健康', price: 18, purchaseWay: '网购拼团',
    planting: '颗粒', env: 'balcony', location: '阳台花架', bought: 210, tags: ['succulent', 'sale'],
    water: 10, fert: 60, repot: 365, images: ['bearpaw'],
    description: '侧芽多，打算出几棵。',
    records: [['浇水', 4, ''], ['修剪', 20, '砍头扦插']]
  },
  {
    key: 'aloe', name: '芦荟', variety: '库拉索', status: '健康', price: 9.9, purchaseWay: '实体花市',
    planting: '土培', env: 'balcony', location: '阳台地面', bought: 700, tags: ['succulent', 'sale'],
    water: 14, fert: 60, repot: 365, images: ['aloe'],
    description: '',
    records: [['浇水', 6, ''], ['换盆', 380, '']]
  },
  {
    key: 'mint', name: '薄荷', variety: '留兰香', status: '死亡', price: 6.5, purchaseWay: '实体花市',
    planting: '土培', env: 'balcony', location: '阳台窗台', bought: 100, tags: [],
    water: 3, fert: 30, repot: 365, images: ['mint'],
    description: '夏天出差一周被晒干了。',
    records: [['浇水', 40, '']]
  },
  {
    key: 'basil', name: '罗勒', variety: '甜罗勒', status: '健康', price: 8, purchaseWay: '自己繁育',
    planting: '土培', env: 'balcony', location: '阳台种植箱', bought: 60, tags: [],
    water: 3, fert: 20, repot: 365, images: ['basil'],
    description: '可以掐尖做青酱了。',
    records: [['浇水', 3, ''], ['修剪', 10, '掐尖']]
  },
  {
    key: 'geranium', name: '天竺葵', variety: '玫瑰香', status: '健康', price: 32, purchaseWay: '花店',
    planting: '土培', env: 'balcony', location: '阳台栏杆', bought: 140, tags: ['flower'],
    water: 5, fert: 25, repot: 365, images: ['geranium'],
    description: '',
    records: [['浇水', 2, ''], ['施肥', 12, '']]
  },
  {
    key: 'rose', name: '月季', variety: '果汁阳台', status: '病害', price: 35, purchaseWay: '线上网店',
    planting: '土培', env: 'balcony', location: '阳台角落', bought: 330, tags: ['flower'],
    water: 4, fert: 15, repot: 365, images: ['rose'],
    description: '黑斑病复发，摘除病叶。',
    records: [['浇水', 1, ''], ['施肥', 18, ''], ['防治病虫害', 2, '摘病叶 + 喷药', true]]
  },
  {
    key: 'jasmine', name: '茉莉', variety: '双瓣', status: '健康', price: 39.9, purchaseWay: '实体花市',
    planting: '土培', env: 'balcony', location: '阳台花架', bought: 230, tags: ['flower'],
    water: 4, fert: 15, repot: 365, images: ['jasmine'],
    description: '今年开了三茬花。',
    records: [['浇水', 0, '傍晚浇透'], ['施肥', 14, '矾肥水']]
  },
  {
    key: 'rubber', name: '橡皮树', variety: '黑金刚', status: '健康', price: 158, purchaseWay: '线上网店',
    planting: '土培', env: 'living', location: '书房门口', bought: 280, tags: ['foliage'],
    water: 9, fert: 30, repot: 365, images: ['rubber'],
    description: '',
    records: [['浇水', 5, ''], ['施肥', 29, '']]
  },
  {
    key: 'tillandsia', name: '空气凤梨', variety: '霸王', status: '健康', price: 12, purchaseWay: '网购拼团',
    planting: '板植', env: 'shelf', location: '挂在书架上', bought: 75, tags: [],
    water: 5, fert: 30, repot: 3650, images: ['tillandsia'],
    description: '每周泡水一次。',
    records: [['浇水', 9, '泡水 30 分钟']]
  },
  {
    key: 'nepenthes', name: '猪笼草', variety: '葫芦笼', status: '待观察', price: 99, purchaseWay: '线上网店',
    planting: '水苔', env: 'bath', location: '浴室窗台', bought: 45, tags: [],
    water: 3, fert: 0, repot: 365, images: ['nepenthes'],
    description: '新笼子还没长出来。',
    records: [['浇水', 2, '纯净水']]
  },
  {
    key: 'asparagus', name: '文竹', variety: '', status: '健康', price: 520, purchaseWay: '花店',
    planting: '土培', env: 'shelf', location: '书桌', bought: 900, tags: ['foliage'],
    water: 5, fert: 30, repot: 365, images: ['asparagus'],
    description: '养了两年多的大文竹。',
    records: [['浇水', 70, '']],
    memorial: { type: '送人', daysAgo: 60, note: '搬家时送给了楼下的阿姨，她说会好好养。' }
  },
  {
    key: 'maidenhair', name: '铁线蕨', variety: '楔叶', status: '死亡', price: 300, purchaseWay: '朋友赠送',
    planting: '土培', env: 'bath', location: '浴室', bought: 365, tags: ['fern'],
    water: 2, fert: 30, repot: 365, images: ['maidenhair'],
    description: '对湿度太挑剔了。',
    records: [['浇水', 50, '']],
    memorial: { type: '去世', daysAgo: 45, note: '没熬过夏天的空调房，下次一定加湿。' }
  }
];

// mother: { plant: key } / { seedling: key } / { text, image } / null
const seedlings = [
  {
    key: 's-monstera-1', name: '龟背竹扦插第 1 批', method: '扦插', daysAgo: 150, mother: { plant: 'monstera' },
    images: ['cutting'], plannedCount: 20, gridRows: 2, gridCols: 10, substrate: '水苔', container: '穴盘',
    place: '阳台育苗架', note: '带气根的茎段，两周出根。'
  },
  {
    key: 's-monstera-2', name: '龟背竹二代', method: '压条', daysAgo: 90, mother: { seedling: 's-monstera-1' },
    images: ['monstera'], plannedCount: 6, gridRows: 0, gridCols: 0, substrate: '泥炭+珍珠岩', container: '塑料圆盆',
    place: '阳台育苗架', note: '从第 1 批里最壮的一棵压条。'
  },
  {
    key: 's-monstera-3', name: '龟背竹三代组培苗', method: '组培', daysAgo: 30, mother: { seedling: 's-monstera-2' },
    images: ['tissue'], plannedCount: 50, gridRows: 5, gridCols: 10, substrate: '其他培养基', container: '其他',
    place: '书房补光架', note: '送去朋友实验室做的组培。'
  },
  {
    key: 's-monstera-b', name: '龟背竹扦插第 2 批', method: '扦插', daysAgo: 40, mother: { plant: 'monstera' },
    images: ['cutting'], plannedCount: 8, gridRows: 2, gridCols: 4, substrate: '珍珠岩', container: '塑料四方盆',
    place: '阳台育苗架', note: ''
  },
  {
    key: 's-snake', name: '虎尾兰叶插', method: '叶插', daysAgo: 120, mother: { plant: 'snake' },
    images: ['snake'], plannedCount: 12, gridRows: 3, gridCols: 4, substrate: '颗粒', container: '穴盘',
    place: '客厅散射光', note: '切段后晾干两天再插。'
  },
  {
    key: 's-spider', name: '吊兰分株', method: '分株', daysAgo: 80, mother: { plant: 'spider' },
    images: ['spider'], plannedCount: 3, gridRows: 0, gridCols: 0, substrate: '土培', container: '塑料圆盆',
    place: '南阳台直射', note: ''
  },
  {
    key: 's-rose', name: '月季嫁接', method: '嫁接', daysAgo: 70, mother: { plant: 'rose' },
    images: ['grafting'], plannedCount: 4, gridRows: 0, gridCols: 0, substrate: '泥炭+珍珠岩', container: '塑料圆盆',
    place: '南阳台直射', note: '用蔷薇做砧木。'
  },
  {
    key: 's-basil', name: '罗勒播种', method: '播种', daysAgo: 25, mother: { text: '超市买的种子包', image: 'basil' },
    images: ['seedtray'], plannedCount: 30, gridRows: 3, gridCols: 10, substrate: '泥炭+珍珠岩', container: '穴盘',
    place: '阳台种植箱', note: '出苗率大约七成。'
  },
  {
    key: 's-staghorn', name: '鹿角蕨孢子播种', method: '孢子', daysAgo: 200, mother: { plant: 'staghorn' },
    images: ['spore'], plannedCount: 100, gridRows: 1, gridCols: 1, substrate: '水苔', container: '其他',
    place: '卫生间弱光', note: '密封保湿，慢慢等原叶体。'
  },
  {
    key: 's-fig', name: '无花果根插', method: '根插', daysAgo: 55, mother: { text: '邻居家的老树' },
    images: ['fig'], plannedCount: 5, gridRows: 0, gridCols: 0, substrate: '土培', container: '塑料圆盆',
    place: '南阳台直射', note: ''
  },
  {
    key: 's-bearpaw', name: '熊童子砍头苗', method: '其他', daysAgo: 20, mother: null,
    images: ['bearpaw'], plannedCount: 6, gridRows: 2, gridCols: 3, substrate: '颗粒', container: '穴盘',
    place: '阳台育苗架', note: '母株信息没记，只记了是砍头下来的。'
  }
];

// [几天前, 类别, 金额, 备注]
const expenses = [
  [0, '肥料', 0.1, '试用装'],
  [0, '药剂', 0.2, '试用装'],
  [1, '农资花费', 23.5, '颗粒土 5L'],
  [3, '补光灯', 129, '全光谱灯条'],
  [6, '其他', 15, '喷壶'],
  [8, '肥料', 36.8, '缓释肥'],
  [10, '药剂', 19.9, '阿维菌素'],
  [13, '农资花费', 12, '水苔 500g'],
  [20, '肥料', 9.9, '兰花专用肥'],
  [27, '其他', 45, '植物支架'],
  [35, '农资花费', 58, '穴盘 + 育苗盒'],
  [42, '补光灯', 89, '定时插座'],
  [60, '药剂', 25.5, '多菌灵'],
  [75, '肥料', 18, '矾肥水材料'],
  [95, '农资花费', 66.6, '赤玉土'],
  [120, '其他', 30, '花架挂钩'],
  [150, '补光灯', 199, '生长灯'],
  [185, '肥料', 42, '海藻精'],
  [220, '药剂', 33.3, '杀虫套装'],
  [270, '农资花费', 88, '陶粒和鹿沼土'],
  [330, '其他', 12.5, '标签牌'],
  [380, '肥料', 27, '复合肥'],
  [450, '补光灯', 159, '补光灯'],
  [560, '农资花费', 40, '泥炭土'],
  [740, '其他', 66, '园艺工具套装'],
  [900, '药剂', 21.2, '护根剂']
];

module.exports = { envs, tags, plants, seedlings, expenses };
