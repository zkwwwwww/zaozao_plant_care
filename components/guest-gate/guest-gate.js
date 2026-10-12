Component({
  properties: {
    show: { type: Boolean, value: false }
  },

  methods: {
    goLogin() {
      wx.switchTab({ url: '/pages/account/account' });
    }
  }
});
