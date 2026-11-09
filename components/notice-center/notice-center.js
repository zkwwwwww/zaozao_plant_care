const notifications = require('../../services/notifications');

Component({
  data: {
    notice: null,
    confetti: Array.from({ length: 14 }, (_, index) => ({
      id: index,
      style: 'left:' + (8 + index * 6) + '%;animation-delay:' + (index % 5 * 0.08) + 's;background:' + ['#79b86a', '#e6bb72', '#2e7d5b'][index % 3]
    }))
  },
  lifetimes: {
    attached() {
      this._host = { render: notice => this.setData({ notice }) };
      notifications.show(this._host);
    },
    detached() { notifications.hide(this._host); }
  },
  pageLifetimes: {
    show() { if (this._host) notifications.show(this._host); },
    hide() { notifications.hide(this._host); }
  },
  methods: {
    preventMove() {},
    close() { notifications.close(this._host, false); },
    disableUpdates() {
      notifications.close(this._host, true);
      this.triggerEvent('updatesdisabled');
    },
    confirm() {
      const kind = this.data.notice.kind;
      notifications.close(this._host, false);
      if (kind === 'daily') {
        wx.setStorageSync('careEntrySection', 'reminder');
        wx.setStorageSync('careUpcomingWindow', 2);
        wx.switchTab({ url: '/pages/reminders/reminders' });
      }
    }
  }
});
