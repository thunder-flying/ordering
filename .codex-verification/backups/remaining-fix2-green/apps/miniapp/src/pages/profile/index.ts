import type { ProfileDto } from "@ordering/contracts";

import { clearPrivateData, deleteAccount } from "../../api/profile";
import { ClientError } from "../../api/request";
import { clearDraft } from "../../state/draft";
import { clearFavorites, settleFavoriteMutations } from "../../state/favorites";
import { requestFavoriteSelectionView } from "../../state/navigation";
import {
  clearProfileState,
  loadProfile,
  saveNickname,
  saveProfileAvatar,
} from "../../state/profile";
import { clearSession } from "../../state/session";
import {
  openPrivacyContractSafely,
  runClearPrivateData,
  runDeleteAccount,
  saveProfileEdit,
  type DestructiveConfirmation,
} from "./model";

type ProfilePhase = "loading" | "ready" | "saving" | "failed";
const savedProfiles = new WeakMap<object, ProfileDto>();

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ClientError) {
    return error.requestId ? `${error.message}（请求编号 ${error.requestId}）` : error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function confirmAction(request: DestructiveConfirmation): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: request.title,
      content: request.content,
      confirmText: request.confirmText,
      cancelText: "保留",
      ...(request.destructive ? { confirmColor: "#9f3f35" } : {}),
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

Page({
  data: {
    phase: "loading" as ProfilePhase,
    nickname: "",
    avatarUrl: "",
    avatarTempPath: null as string | null,
    canSave: false,
    errorMessage: "",
    workingAction: "" as "" | "clear" | "delete",
  },

  onLoad() {
    void this.loadInitialProfile();
  },

  onUnload() {
    savedProfiles.delete(this);
  },

  async loadInitialProfile() {
    this.setData({ phase: "loading", errorMessage: "" });
    try {
      await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
      const profile = await loadProfile();
      savedProfiles.set(this, profile);
      this.setData({
        phase: "ready",
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl ?? "",
        avatarTempPath: null,
        canSave: false,
      });
    } catch (error) {
      this.setData({
        phase: "failed",
        errorMessage: messageFor(error, "个人资料暂时没有加载成功。"),
      });
    }
  },

  updateCanSave() {
    const saved = savedProfiles.get(this);
    const nickname = this.data.nickname.trim();
    this.setData({
      canSave: Boolean(saved)
        && nickname.length > 0
        && (nickname !== saved?.nickname || Boolean(this.data.avatarTempPath))
        && this.data.phase !== "saving",
    });
  },

  handleAvatarChange(event: WechatMiniprogram.CustomEvent<{ avatarTempPath: string }>) {
    if (this.data.phase === "saving") return;
    this.setData({
      avatarTempPath: event.detail.avatarTempPath,
      avatarUrl: event.detail.avatarTempPath,
      errorMessage: "",
    });
    this.updateCanSave();
  },

  handleNicknameChange(event: WechatMiniprogram.CustomEvent<{ nickname: string }>) {
    if (this.data.phase === "saving") return;
    this.setData({ nickname: event.detail.nickname, errorMessage: "" });
    this.updateCanSave();
  },

  async handleSaveProfile() {
    const savedProfile = savedProfiles.get(this);
    if (!savedProfile || !this.data.canSave || this.data.phase === "saving") return;
    this.setData({ phase: "saving", canSave: false, errorMessage: "" });
    const result = await saveProfileEdit({
      savedProfile,
      nickname: this.data.nickname,
      avatarTempPath: this.data.avatarTempPath,
    }, {
      saveAvatar: saveProfileAvatar,
      saveNickname,
    });
    if (result.status === "saved") {
      savedProfiles.set(this, result.profile);
      this.setData({
        phase: "ready",
        nickname: result.profile.nickname,
        avatarUrl: result.profile.avatarUrl ?? "",
        avatarTempPath: null,
        canSave: false,
      });
      wx.showToast({ title: "个人资料已保存", icon: "success" });
      return;
    }

    savedProfiles.set(this, result.profile);
    this.setData({
      phase: "ready",
      nickname: result.draft.nickname,
      avatarUrl: result.draft.avatarTempPath ?? result.profile.avatarUrl ?? "",
      avatarTempPath: result.draft.avatarTempPath,
      errorMessage: messageFor(result.error, "资料尚未全部保存，请继续重试。"),
    });
    this.updateCanSave();
  },

  handleOpenFavorites() {
    requestFavoriteSelectionView();
    wx.switchTab({ url: "/pages/select/index" });
  },

  async handleOpenPrivacyContract() {
    type PrivacyApi = (options: {
      success(): void;
      fail(error: unknown): void;
    }) => void;
    const privacyApi = (wx as unknown as { openPrivacyContract?: PrivacyApi }).openPrivacyContract;
    await openPrivacyContractSafely({
      open: privacyApi
        ? () => new Promise<void>((resolve, reject) => {
          privacyApi({ success: resolve, fail: reject });
        })
        : undefined,
      notify: (message) => wx.showToast({ title: message, icon: "none", duration: 3200 }),
    });
  },

  async handleClearData() {
    if (this.data.workingAction) return;
    this.setData({ workingAction: "clear", errorMessage: "" });
    const result = await runClearPrivateData({
      confirm: confirmAction,
      settleFavorites: settleFavoriteMutations,
      clearRemote: clearPrivateData,
      clearDraft,
      clearFavorites,
    });
    this.setData({ workingAction: "" });
    if (result.status === "cleared") {
      wx.showToast({ title: "个人数据已清空", icon: "success" });
    } else if (result.status === "failed") {
      this.setData({
        errorMessage: messageFor(result.error, "清空没有完成，本地内容仍然保留。"),
      });
    }
  },

  async handleDeleteAccount() {
    if (this.data.workingAction) return;
    this.setData({ workingAction: "delete", errorMessage: "" });
    const result = await runDeleteAccount({
      confirm: confirmAction,
      settleFavorites: settleFavoriteMutations,
      deleteRemote: deleteAccount,
      clearSession,
      clearProfile: clearProfileState,
      clearDraft,
      clearFavorites,
      relaunch: () => wx.reLaunch({ url: "/pages/onboarding/index" }),
    });
    if (result.status === "failed") {
      this.setData({
        workingAction: "",
        errorMessage: messageFor(result.error, "注销没有完成，个人资料和本地内容仍然保留。"),
      });
    } else if (result.status === "canceled") {
      this.setData({ workingAction: "" });
    }
  },
});
