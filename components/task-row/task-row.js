Component({
  options: {
    virtualHost: true
  },

  properties: {
    photo: { type: String, value: '' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    statusText: { type: String, value: '' },
    statusClass: { type: String, value: 'tag-gray' },
    showComplete: { type: Boolean, value: false },
    itemId: { type: String, value: '' },
    taskType: { type: String, value: '' }
  },

  methods: {
    onTap() {
      this.triggerEvent('select', { id: this.data.itemId, type: this.data.taskType });
    },
    onComplete() {
      this.triggerEvent('complete', { id: this.data.itemId, type: this.data.taskType });
    }
  }
});
