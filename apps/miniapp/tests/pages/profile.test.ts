import type { ProfileDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import {
  openPrivacyContractSafely,
  runClearPrivateData,
  runDeleteAccount,
  saveProfileEdit,
  type DestructiveConfirmation,
} from "../../src/pages/profile/model";

const savedProfile: ProfileDto = {
  nickname: "小满",
  avatarUrl: "https://example.test/avatar-old.jpg",
  profileComplete: true,
  onboardingCompleted: true,
};

type LocalState = {
  draft: boolean;
  favorites: boolean;
  session: boolean;
  profile: boolean;
  relaunches: number;
};

function localState(): LocalState {
  return { draft: true, favorites: true, session: true, profile: true, relaunches: 0 };
}

function blockRecorder(calls?: string[]): () => void {
  calls?.push("block");
  return () => { calls?.push("release"); };
}

describe("profile page model", () => {
  it("uses a separate stronger confirmation for account deletion", async () => {
    const confirmations: DestructiveConfirmation[] = [];
    const confirm = async (request: DestructiveConfirmation) => {
      confirmations.push(request);
      return false;
    };

    await runClearPrivateData({
      confirm,
      blockFavorites: () => blockRecorder(),
      settleFavorites: async () => undefined,
      clearRemote: async () => undefined,
      clearDraft: () => undefined,
      clearFavorites: () => undefined,
    });
    await runDeleteAccount({
      confirm,
      blockFavorites: () => blockRecorder(),
      settleFavorites: async () => undefined,
      deleteRemote: async () => undefined,
      clearSession: () => undefined,
      clearProfile: () => undefined,
      clearDraft: () => undefined,
      clearFavorites: () => undefined,
      relaunch: () => undefined,
    });

    expect(confirmations).toEqual([
      expect.objectContaining({ kind: "clear-data", confirmText: "确认清空", destructive: false }),
      expect.objectContaining({ kind: "delete-account", confirmText: "确认注销", destructive: true }),
    ]);
  });

  it("blocks new writes, settles old writes, clears remote data, then releases the barrier", async () => {
    const state = localState();
    const calls: string[] = [];

    await expect(runClearPrivateData({
      confirm: async (_request: DestructiveConfirmation) => { calls.push("confirm"); return true; },
      blockFavorites: () => blockRecorder(calls),
      settleFavorites: async () => { calls.push("settle"); },
      clearRemote: async () => { calls.push("remote"); },
      clearDraft: () => { calls.push("draft"); state.draft = false; },
      clearFavorites: () => { calls.push("favorites"); state.favorites = false; },
    })).resolves.toEqual({ status: "cleared" });

    expect(calls).toEqual(["confirm", "block", "settle", "remote", "draft", "favorites", "release"]);
    expect(state).toEqual({ draft: false, favorites: false, session: true, profile: true, relaunches: 0 });
  });

  it("does not block when data clearing is canceled, and releases while preserving local state on remote failure", async () => {
    const canceled = localState();
    const canceledCalls: string[] = [];
    await expect(runClearPrivateData({
      confirm: async (_request: DestructiveConfirmation) => { canceledCalls.push("confirm"); return false; },
      blockFavorites: () => blockRecorder(canceledCalls),
      settleFavorites: async () => { canceledCalls.push("settle"); },
      clearRemote: async () => { canceledCalls.push("remote"); },
      clearDraft: () => { canceled.draft = false; },
      clearFavorites: () => { canceled.favorites = false; },
    })).resolves.toEqual({ status: "canceled" });
    expect(canceledCalls).toEqual(["confirm"]);
    expect(canceled).toEqual(localState());

    const failed = localState();
    const failure = new Error("offline");
    const failedCalls: string[] = [];
    await expect(runClearPrivateData({
      confirm: async (_request: DestructiveConfirmation) => { failedCalls.push("confirm"); return true; },
      blockFavorites: () => blockRecorder(failedCalls),
      settleFavorites: async () => { failedCalls.push("settle"); },
      clearRemote: async () => { failedCalls.push("remote"); throw failure; },
      clearDraft: () => { failed.draft = false; },
      clearFavorites: () => { failed.favorites = false; },
    })).resolves.toEqual({ status: "failed", error: failure });
    expect(failedCalls).toEqual(["confirm", "block", "settle", "remote", "release"]);
    expect(failed).toEqual(localState());
  });

  it("blocks new writes before account deletion and releases after every local identity state is cleared", async () => {
    const state = localState();
    const calls: string[] = [];

    await expect(runDeleteAccount({
      confirm: async (_request: DestructiveConfirmation) => { calls.push("confirm"); return true; },
      blockFavorites: () => blockRecorder(calls),
      settleFavorites: async () => { calls.push("settle"); },
      deleteRemote: async () => { calls.push("remote"); },
      clearSession: () => { calls.push("session"); state.session = false; },
      clearProfile: () => { calls.push("profile"); state.profile = false; },
      clearDraft: () => { calls.push("draft"); state.draft = false; },
      clearFavorites: () => { calls.push("favorites"); state.favorites = false; },
      relaunch: () => { calls.push("relaunch"); state.relaunches += 1; },
    })).resolves.toEqual({ status: "deleted" });

    expect(calls).toEqual([
      "confirm", "block", "settle", "remote", "session", "profile", "draft", "favorites", "relaunch", "release",
    ]);
    expect(state).toEqual({ draft: false, favorites: false, session: false, profile: false, relaunches: 1 });
  });

  it("does not block when deletion is canceled, and releases while preserving all state on remote failure", async () => {
    const canceled = localState();
    const canceledCalls: string[] = [];
    await expect(runDeleteAccount({
      confirm: async (_request: DestructiveConfirmation) => { canceledCalls.push("confirm"); return false; },
      blockFavorites: () => blockRecorder(canceledCalls),
      settleFavorites: async () => { canceledCalls.push("settle"); },
      deleteRemote: async () => { canceledCalls.push("remote"); },
      clearSession: () => { canceled.session = false; },
      clearProfile: () => { canceled.profile = false; },
      clearDraft: () => { canceled.draft = false; },
      clearFavorites: () => { canceled.favorites = false; },
      relaunch: () => { canceled.relaunches += 1; },
    })).resolves.toEqual({ status: "canceled" });
    expect(canceledCalls).toEqual(["confirm"]);
    expect(canceled).toEqual(localState());

    const failed = localState();
    const failure = new Error("server unavailable");
    const failedCalls: string[] = [];
    await expect(runDeleteAccount({
      confirm: async (_request: DestructiveConfirmation) => { failedCalls.push("confirm"); return true; },
      blockFavorites: () => blockRecorder(failedCalls),
      settleFavorites: async () => { failedCalls.push("settle"); },
      deleteRemote: async () => { failedCalls.push("remote"); throw failure; },
      clearSession: () => { failed.session = false; },
      clearProfile: () => { failed.profile = false; },
      clearDraft: () => { failed.draft = false; },
      clearFavorites: () => { failed.favorites = false; },
      relaunch: () => { failed.relaunches += 1; },
    })).resolves.toEqual({ status: "failed", error: failure });
    expect(failedCalls).toEqual(["confirm", "block", "settle", "remote", "release"]);
    expect(failed).toEqual(localState());
  });

  it("keeps the unsaved avatar and nickname draft when avatar upload fails", async () => {
    const avatarFailure = new Error("avatar upload failed");
    await expect(saveProfileEdit({
      savedProfile,
      nickname: "新名字",
      avatarTempPath: "wxfile://broken.jpg",
    }, {
      saveAvatar: async (_path: string) => { throw avatarFailure; },
      saveNickname: async (_nickname: string) => ({ ...savedProfile, nickname: "新名字" }),
    })).resolves.toEqual({
      status: "failed",
      profile: savedProfile,
      draft: { nickname: "新名字", avatarTempPath: "wxfile://broken.jpg" },
      error: avatarFailure,
    });
  });

  it("advances the saved avatar baseline and keeps nickname retryable when nickname saving fails", async () => {
    const avatarSaved: ProfileDto = { ...savedProfile, avatarUrl: "https://example.test/avatar-new.jpg" };
    const nicknameFailure = new Error("nickname save failed");
    await expect(saveProfileEdit({
      savedProfile,
      nickname: "新名字",
      avatarTempPath: "wxfile://avatar.jpg",
    }, {
      saveAvatar: async (_path: string) => avatarSaved,
      saveNickname: async (_nickname: string) => { throw nicknameFailure; },
    })).resolves.toEqual({
      status: "failed",
      profile: avatarSaved,
      draft: { nickname: "新名字", avatarTempPath: null },
      error: nicknameFailure,
    });
  });

  it("returns the final server profile only after every requested profile edit succeeds", async () => {
    const avatarSaved: ProfileDto = { ...savedProfile, avatarUrl: "https://example.test/avatar-new.jpg" };
    const nicknameSaved: ProfileDto = { ...avatarSaved, nickname: "新名字" };
    const calls: string[] = [];

    await expect(saveProfileEdit({
      savedProfile,
      nickname: "  新名字  ",
      avatarTempPath: "wxfile://avatar.jpg",
    }, {
      saveAvatar: async (path: string) => { calls.push(`avatar:${path}`); return avatarSaved; },
      saveNickname: async (nickname: string) => { calls.push(`nickname:${nickname}`); return nicknameSaved; },
    })).resolves.toEqual({ status: "saved", profile: nicknameSaved });
    expect(calls).toEqual(["avatar:wxfile://avatar.jpg", "nickname:新名字"]);
  });

  it("shows a clear message when the privacy contract API is unavailable", async () => {
    const notices: string[] = [];
    await expect(openPrivacyContractSafely({
      open: undefined,
      notify: (message: string) => { notices.push(message); },
    })).resolves.toEqual({ status: "unavailable" });
    expect(notices).toEqual(["当前微信版本暂不支持打开隐私保护指引，请升级微信后重试。"]);
  });
});
