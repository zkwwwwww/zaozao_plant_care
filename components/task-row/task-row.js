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
    showIgnore: { type: Boolean, value: false },
    selectable: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
    taskKey: { type: String, value: '' },
    taskId: { type: String, value: '' },
    itemId: { type: String, value: '' },
    taskType: { type: String, value: '' }
  },

  methods: {
    onTap() {
      if (this.data.selectable) return this.onCheck();
      this.triggerEvent('select', { id: this.data.itemId, type: this.data.taskType });
    },
    onCheck() {
      this.triggerEvent('check', { key: this.data.taskKey });
    },
    onComplete() {
      this.triggerEvent('complete', { id: this.data.itemId, type: this.data.taskType, taskId: this.data.taskId });
    },
    onIgnore() {
      this.triggerEvent('ignore', { id: this.data.itemId, type: this.data.taskType });
    }
  }
});
