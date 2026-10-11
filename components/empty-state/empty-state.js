Component({
  properties: {
    image: { type: String, value: '/assets/illustrations/plant-placeholder.png' },
    title: { type: String, value: '暂无内容' },
    description: { type: String, value: '' },
    buttonText: { type: String, value: '' },
    compact: { type: Boolean, value: false }
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
