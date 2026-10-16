// pages/seedling-edit/seedling-edit.js 新建 / 编辑育苗
const account = require('../../services/account');
const dataApi = require('../../services/data');
const constants = require('../../utils/constants');
const format = require('../../utils/format');
const lineage = require('../../utils/lineage');
const media = require('../../utils/media');

const MOTHER_MODES = [
  { key: '', label: '不填' },
  { key: 'plant', label: '我的植物' },
  { key: 'seedling', label: '我的育苗' },
  { key: 'text', label: '手写来源' }
];

function rowLetter(index) {
  return String.fromCharCode(65 + (index % 26)) + (index >= 26 ? Math.floor(index / 26) : '');
}

function gridText(rows, cols) {
  const r = Number(rows) || 0;
  const c = Number(cols) || 0;
  if (!r || !c) return '';
  return '格位 A1 – ' + rowLetter(r - 1) + c + '，共 ' + r * c + ' 格';
}

Page({
  data: {
    id: '',
    isEdit: false,
    form: {
      name: '',
      method: '',
      startDate: format.today(),
      motherType: '',
      motherId: '',
      motherText: '',
      plannedCount: '',
      gridRows: '',
      gridCols: '',
      substrate: '',
      container: '',
      place: '',
      note: ''
    },
    photos: [],
    motherPhotos: [],
    motherModes: MOTHER_MODES,
    methods: constants.PROPAGATION_METHODS,
    substrates: constants.SUBSTRATE_OPTIONS,
    containers: constants.CONTAINER_OPTIONS,
    substrateCustom: false,
    containerCustom: false,
    places: [],
    plantOptions: [],
    seedlingOptions: [],
    motherName: '',
    gridPreview: '',
    isSavingPhoto: false,
    isSubmitting: false
  },

  async onLoad(options) {
    if (!account.requireLogin()) return;
    let bundle;
    try {
      bundle = await dataApi.loadBundle();
    } catch (error) {
      wx.showToast({ title: error.message || '读取失败', icon: 'none' });
      return;
    }
    this._seedlings = bundle.seedlings;
    const current = options.id ? bundle.seedlings.find(item => item.id === options.id) : null;
    const form = Object.assign({}, this.data.form);
    if (current) {
      Object.keys(form).forEach(key => {
        const value = current[key];
        form[key] = value === 0 ? '' : String(value == null ? '' : value);
      });
      this.setData({
        id: current.id,
        isEdit: true,
        photos: current.photos,
        motherPhotos: current.motherPhotos
      });
      wx.setNavigationBarTitle({ title: '编辑育苗' });
    } else if (options.motherType && options.motherId) {
      form.motherType = options.motherType;
      form.motherId = options.motherId;
    }

    const plantOptions = bundle.plants.filter(p => !p.memorialized).map(p => ({ id: p.id, name: p.name }));
    const seedlingOptions = bundle.seedlings
      .filter(s => !current || (s.id !== current.id && !lineage.wouldCycle(current.id, { type: 'seedling', id: s.id }, bundle.seedlings)))
      .map(s => ({ id: s.id, name: s.name + ' · ' + s.startDate }));
    const places = [];
    bundle.envs.map(env => env.name).concat(bundle.seedlings.map(s => s.place)).forEach(name => {
      if (name && places.indexOf(name) < 0) places.push(name);
    });

    this.setData({
      form,
      plantOptions,
      seedlingOptions,
      places,
      substrateCustom: !!form.substrate && constants.SUBSTRATE_OPTIONS.indexOf(form.substrate) < 0,
      containerCustom: !!form.container && constants.CONTAINER_OPTIONS.indexOf(form.container) < 0,
      gridPreview: gridText(form.gridRows, form.gridCols)
    });
    this.refreshMotherName();
  },

  refreshMotherName() {
    const { motherType, motherId } = this.data.form;
    const source = motherType === 'plant' ? this.data.plantOptions : (motherType === 'seedling' ? this.data.seedlingOptions : []);
    const found = source.find(item => item.id === motherId);
    this.setData({ motherName: found ? found.name : '' });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onCountInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value.replace(/[^\d]/g, '');
    this.setData({ ['form.' + field]: value });
    if (field === 'gridRows' || field === 'gridCols') {
      const form = Object.assign({}, this.data.form, { [field]: value });
      this.setData({ gridPreview: gridText(form.gridRows, form.gridCols) });
    }
  },

  onDate(e) {
    this.setData({ 'form.startDate': e.detail.value });
  },

  pickMethod(e) {
    this.setData({ 'form.method': e.currentTarget.dataset.value });
  },

  pickSubstrate(e) {
    const value = e.currentTarget.dataset.value;
    const custom = value === '其他';
    this.setData({ substrateCustom: custom, 'form.substrate': custom ? '' : value });
  },

  pickContainer(e) {
    const value = e.currentTarget.dataset.value;
    const custom = value === '其他';
    this.setData({ containerCustom: custom, 'form.container': custom ? '' : value });
  },

  pickPlace(e) {
    this.setData({ 'form.place': e.currentTarget.dataset.value });
  },

  pickMotherMode(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.form.motherType) return;
    this.setData({ 'form.motherType': key, 'form.motherId': '', motherName: '' });
  },

  onMotherPick(e) {
    const source = this.data.form.motherType === 'plant' ? this.data.plantOptions : this.data.seedlingOptions;
    const item = source[Number(e.detail.value)];
    if (!item) return;
    this.setData({ 'form.motherId': item.id, motherName: item.name });
  },

  choosePhotos(field, max) {
    const current = this.data[field];
    if (this.data.isSavingPhoto || current.length >= max) return;
    wx.chooseMedia({
      count: max - current.length,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        if (!paths.length) return;
        this.setData({ isSavingPhoto: true });
        wx.showLoading({ title: '保存照片中', mask: true });
        try {
          const result = await media.saveImages(paths);
          this.setData({ [field]: this.data[field].concat(result.savedPaths) });
          if (result.failedCount) wx.showToast({ title: result.failedCount + ' 张照片保存失败', icon: 'none' });
        } catch (error) {
          wx.showToast({ title: '照片保存失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ isSavingPhoto: false });
        }
      },
      fail: (error) => {
        if (error && /cancel/.test(error.errMsg || '')) return;
        wx.showToast({ title: (error && error.errMsg) || '无法选择照片', icon: 'none' });
      }
    });
  },

  addPhoto() {
    this.choosePhotos('photos', 9);
  },

  addMotherPhoto() {
    this.choosePhotos('motherPhotos', 3);
  },

  removePhoto(e) {
    const field = e.currentTarget.dataset.field;
    const list = this.data[field].slice();
    list.splice(Number(e.currentTarget.dataset.idx), 1);
    this.setData({ [field]: list });
  },

  previewPhoto(e) {
    const field = e.currentTarget.dataset.field;
    wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data[field] });
  },

  async save() {
    if (!account.requireLogin()) {
      account.promptLogin();
      return;
    }
    if (this.data.isSavingPhoto || this.data.isSubmitting) return;
    const form = this.data.form;
    if (!form.name.trim()) return wx.showToast({ title: '请填写育苗名称', icon: 'none' });
    if (!form.method) return wx.showToast({ title: '请选择繁殖方式', icon: 'none' });
    if (!form.startDate) return wx.showToast({ title: '请选择育苗日期', icon: 'none' });
    if ((form.motherType === 'plant' || form.motherType === 'seedling') && !form.motherId) {
      return wx.showToast({ title: '请选择母株', icon: 'none' });
    }
    if (form.motherType === 'seedling' && this.data.id &&
      lineage.wouldCycle(this.data.id, { type: 'seedling', id: form.motherId }, this._seedlings || [])) {
      return wx.showToast({ title: '不能选择自己的子代作为母株', icon: 'none' });
    }
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      const saved = await dataApi.saveSeedling({
        id: this.data.id,
        name: form.name.trim(),
        method: form.method,
        startDate: form.startDate,
        motherType: form.motherType,
        motherId: form.motherId,
        motherText: form.motherType === 'text' ? form.motherText.trim() : '',
        motherPhotos: form.motherType === 'text' ? this.data.motherPhotos : [],
        photos: this.data.photos,
        plannedCount: Number(form.plannedCount) || 0,
        gridRows: Number(form.gridRows) || 0,
        gridCols: Number(form.gridCols) || 0,
        substrate: form.substrate.trim(),
        container: form.container.trim(),
        place: form.place.trim(),
        note: form.note.trim()
      });
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      if (this.data.isEdit) wx.navigateBack();
      else wx.redirectTo({ url: '/pages/seedling-detail/seedling-detail?id=' + saved.id });
    } catch (error) {
      wx.hideLoading();
      this.setData({ isSubmitting: false });
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    }
  }
});
