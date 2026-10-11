const account = require('../../services/account');

Component({
  properties: {
    show: { type: Boolean, value: false }
  },

  methods: {
    onTap() {
      account.promptLogin();
    },

    goLogin() {
      wx.switchTab({ url: '/pages/account/account' });
    }
  }
});
