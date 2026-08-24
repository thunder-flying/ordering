Component({
  properties: {
    kind: { type: String, value: "empty" },
    title: { type: String, value: "暂时没有内容" },
    detail: { type: String, value: "" },
    actionText: { type: String, value: "" },
  },

  methods: {
    handleAction() {
      this.triggerEvent("action");
    },
  },
});
