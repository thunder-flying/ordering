import { ClientError } from "../../api/request";
import {
  completeProfileOnboarding,
  loadProfile,
  saveNickname,
  saveProfileAvatar,
} from "../../state/profile";
import {
  canSaveOnboarding,
  saveOnboardingDraft,
  skipOnboarding,
  type OnboardingDraft,
} from "./model";

type OnboardingPhase = "loading" | "editing" | "saving" | "failed";

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ClientError) {
    return error.requestId ? `${error.message}（请求编号 ${error.requestId}）` : error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

Page({
  data: {
    phase: "loading" as OnboardingPhase,
    nickname: "",
    avatarTempPath: null as string | null,
    avatarUrl: "",
    canSave: false,
    errorMessage: "",
  },

  async onLoad() {
    await this.loadInitialProfile();
  },

  async loadInitialProfile() {
    this.setData({ phase: "loading", errorMessage: "" });
    try {
      await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
      const profile = await loadProfile();
      if (profile.onboardingCompleted) {
        wx.switchTab({ url: "/pages/select/index" });
        return;
      }
      this.setData({
        phase: "editing",
        nickname: profile.nickname === "微信用户" ? "" : profile.nickname,
        avatarUrl: profile.avatarUrl ?? "",
      });
      this.updateSaveAvailability();
    } catch (error) {
      this.setData({
        phase: "failed",
        errorMessage: messageFor(error, "资料暂时没有加载成功，请稍后重试。"),
      });
    }
  },

  updateSaveAvailability() {
    this.setData({
      canSave: canSaveOnboarding({
        nickname: this.data.nickname,
        avatarTempPath: this.data.avatarTempPath,
      }),
    });
  },

  handleAvatarChange(event: WechatMiniprogram.CustomEvent<{ avatarTempPath: string }>) {
    const avatarTempPath = event.detail.avatarTempPath;
    this.setData({ avatarTempPath, avatarUrl: avatarTempPath, errorMessage: "" });
    this.updateSaveAvailability();
  },

  handleNicknameChange(event: WechatMiniprogram.CustomEvent<{ nickname: string }>) {
    this.setData({ nickname: event.detail.nickname, errorMessage: "" });
    this.updateSaveAvailability();
  },

  async handleSave() {
    if (this.data.phase === "saving") return;
    const draft: OnboardingDraft = {
      nickname: this.data.nickname,
      avatarTempPath: this.data.avatarTempPath,
    };
    if (!canSaveOnboarding(draft)) return;

    this.setData({ phase: "saving", errorMessage: "" });
    try {
      await saveOnboardingDraft(draft, {
        saveAvatar: saveProfileAvatar,
        saveNickname,
        complete: completeProfileOnboarding,
      });
      wx.switchTab({ url: "/pages/select/index" });
    } catch (error) {
      this.setData({
        phase: "editing",
        errorMessage: messageFor(error, "保存没有完成，已为你保留填写内容。"),
      });
    }
  },

  async handleSkip() {
    if (this.data.phase === "saving") return;
    this.setData({ phase: "saving", errorMessage: "" });
    try {
      await skipOnboarding({ complete: completeProfileOnboarding });
      wx.switchTab({ url: "/pages/select/index" });
    } catch (error) {
      this.setData({
        phase: "editing",
        errorMessage: messageFor(error, "暂时无法继续，请稍后再试。"),
      });
    }
  },
});
