Component({
  options: { styleIsolation: 'isolated' },

  properties: {
    singlePage: { type: Boolean, value: false }
  },

  methods: {
    enterApp() {
      if (this.data.singlePage) return;
      wx.reLaunch({ url: '/pages/index/index' });
    },

    showShareHelp() {
      if (this.data.singlePage) return;
      this.triggerEvent('sharehelp');
    }
  }
});
