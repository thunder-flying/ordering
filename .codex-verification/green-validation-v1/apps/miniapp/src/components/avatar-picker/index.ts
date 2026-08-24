Component({
  properties: {
    avatarUrl: { type: String, value: "" },
    nickname: { type: String, value: "" },
    disabled: { type: Boolean, value: false },
  },

  data: {
    imageFailed: false,
  },

  observers: {
    avatarUrl() {
      this.setData({ imageFailed: false });
    },
  },

  methods: {
    handleChooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
      const avatarTempPath = event.detail.avatarUrl;
      if (avatarTempPath) {
        this.triggerEvent("avatarchange", { avatarTempPath });
      }
    },

    handleNicknameInput(event: WechatMiniprogram.Input) {
      this.triggerEvent("nicknamechange", { nickname: event.detail.value });
    },

    handleImageError() {
      this.setData({ imageFailed: true });
    },
  },
});
