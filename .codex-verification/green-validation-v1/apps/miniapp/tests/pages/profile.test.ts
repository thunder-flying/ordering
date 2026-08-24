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

describe("profile page model", () => {
  it("uses a separate stronger confirmation for account deletion", async () => {
    const confirmations: DestructiveConfirmation[] = [];
    const confirm = async (request: DestructiveConfirmation) => {
      confirmations.push(request);
      return false;
    };

    await runClearPrivateData({
      confirm,
      clearRemote: async () => undefined,
      clearDraft: () => undefined,
      clearFavorites: () => undefined,
    });
    await runDeleteAccount({
      confirm,
      deleteRemote: async () => undefined,
      clearSession: () => undefined,
      clearProfile: () => undefined,
      clearDraft: () => undefined,
      clearFavorites: () => undefined,
      relaunch: () => undefined,
    });

    expect(confirmations).toEqual([
      expect.objectContaining({
        kind: "clear-data",
        confirmText: "确认清空",
        destructive: false,
      }),
      expect.objectContaining({
        kind: "delete-account",
        confirmText: "确认注销",
        destructive: true,
      }),
    ]);
  });

  it("clears draft and favorites after confirmed server data clearing but retains session and profile", async () => {
    const state = localState();
    const calls: string[] = [];

    await expect(runClearPrivateData({
      confirm: async (_request: DestructiveConfirmation) => { calls.push("confirm"); return true; },
      clearRemote: async () => { calls.push("remote"); },
      clearDraft: () => { calls.push("draft"); state.draft = false; },
      clearFavorites: () => { calls.push("favorites"); state.favorites = false; },
    })).resolves.toEqual({ status: "cleared" });

    expect(calls).toEqual(["confirm", "remote", "draft", "favorites"]);
    expect(state).toEqual({
      draft: false,
      favorites: false,
      session: true,
      profile: true,
      relaunches: 0,
    });
  });

  it("does not clear anything when data clearing is canceled or the server rejects it", async () => {
    const canceled = localState();
    let canceledRemoteCalls = 0;
    await expect(runClearPrivateData({
      confirm: async (_request: DestructiveConfirmation) => false,
      clearRemote: async () => { canceledRemoteCalls += 1; },
      clearDraft: () => { canceled.draft = false; },
      clearFavorites: () => { canceled.favorites = false; },
    })).resolves.toEqual({ status: "canceled" });
    expect(canceledRemoteCalls).toBe(0);
    expect(canceled).toEqual(localState());

    const failed = localState();
    const failure = new Error("offline");
    await expect(runClearPrivateData({
      confirm: async (_request: DestructiveConfirmation) => true,
      clearRemote: async () => { throw failure; },
      clearDraft: () => { failed.draft = false; },
      clearFavorites: () => { failed.favorites = false; },
    })).resolves.toEqual({ status: "failed", error: failure });
    expect(failed).toEqual(localState());
  });

  it("clears all private local state and relaunches only after confirmed account deletion succeeds", async () => {
    const state = localState();
    const calls: string[] = [];

    await expect(runDeleteAccount({
      confirm: async (_request: DestructiveConfirmation) => { calls.push("confirm"); return true; },
      deleteRemote: async () => { calls.push("remote"); },
      clearSession: () => { calls.push("session"); state.session = false; },
      clearProfile: () => { calls.push("profile"); state.profile = false; },
      clearDraft: () => { calls.push("draft"); state.draft = false; },
      clearFavorites: () => { calls.push("favorites"); state.favorites = false; },
      relaunch: () => { calls.push("relaunch"); state.relaunches += 1; },
    })).resolves.toEqual({ status: "deleted" });

    expect(calls).toEqual([
      "confirm",
      "remote",
      "session",
      "profile",
      "draft",
      "favorites",
      "relaunch",
    ]);
    expect(state).toEqual({
      draft: false,
      favorites: false,
      session: false,
      profile: false,
      relaunches: 1,
    });
  });

  it("keeps all account state when deletion is canceled or fails remotely", async () => {
    const canceled = localState();
    let canceledRemoteCalls = 0;
    await expect(runDeleteAccount({
      confirm: async (_request: DestructiveConfirmation) => false,
      deleteRemote: async () => { canceledRemoteCalls += 1; },
      clearSession: () => { canceled.session = false; },
      clearProfile: () => { canceled.profile = false; },
      clearDraft: () => { canceled.draft = false; },
      clearFavorites: () => { canceled.favorites = false; },
      relaunch: () => { canceled.relaunches += 1; },
    })).resolves.toEqual({ status: "canceled" });
    expect(canceledRemoteCalls).toBe(0);
    expect(canceled).toEqual(localState());

    const failed = localState();
    const failure = new Error("server unavailable");
    await expect(runDeleteAccount({
      confirm: async (_request: DestructiveConfirmation) => true,
      deleteRemote: async () => { throw failure; },
      clearSession: () => { failed.session = false; },
      clearProfile: () => { failed.profile = false; },
      clearDraft: () => { failed.draft = false; },
      clearFavorites: () => { failed.favorites = false; },
      relaunch: () => { failed.relaunches += 1; },
    })).resolves.toEqual({ status: "failed", error: failure });
    expect(failed).toEqual(localState());
  });

  it("keeps the last saved profile visible when avatar or nickname saving fails", async () => {
    const avatarFailure = new Error("avatar upload failed");
    await expect(saveProfileEdit({
      savedProfile,
      nickname: "新名字",
      avatarTempPath: "wxfile://broken.jpg",
    }, {
      saveAvatar: async (_path: string) => { throw avatarFailure; },
      saveNickname: async (_nickname: string) => ({ ...savedProfile, nickname: "新名字" }),
    })).resolves.toEqual({ status: "failed", profile: savedProfile, error: avatarFailure });

    const nicknameFailure = new Error("nickname save failed");
    await expect(saveProfileEdit({
      savedProfile,
      nickname: "新名字",
      avatarTempPath: null,
    }, {
      saveAvatar: async (_path: string) => ({ ...savedProfile, avatarUrl: "new-avatar" }),
      saveNickname: async (_nickname: string) => { throw nicknameFailure; },
    })).resolves.toEqual({ status: "failed", profile: savedProfile, error: nicknameFailure });
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
    expect(notices).toEqual([
      "当前微信版本暂不支持打开隐私保护指引，请升级微信后重试。",
    ]);
  });
});
