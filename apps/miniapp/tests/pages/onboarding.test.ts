import { describe, expect, it } from "vitest";

import {
  canSaveOnboarding,
  saveOnboardingDraft,
  skipOnboarding,
  type OnboardingDraft,
} from "../../src/pages/onboarding/model";

describe("onboarding model", () => {
  it.each<[OnboardingDraft, boolean]>([
    [{ nickname: "小满", avatarTempPath: "wxfile://avatar.jpg" }, true],
    [{ nickname: "  小满  ", avatarTempPath: "wxfile://avatar.jpg" }, true],
    [{ nickname: "   ", avatarTempPath: "wxfile://avatar.jpg" }, false],
    [{ nickname: "小满", avatarTempPath: null }, false],
  ])("enables save only for a non-empty nickname and selected avatar", (draft, expected) => {
    expect(canSaveOnboarding(draft)).toBe(expected);
  });

  it("uploads the avatar, saves the trimmed nickname, then completes onboarding", async () => {
    const calls: string[] = [];

    await saveOnboardingDraft(
      { nickname: "  小满  ", avatarTempPath: "wxfile://avatar.jpg" },
      {
        saveAvatar: async (path) => { calls.push(`avatar:${path}`); },
        saveNickname: async (nickname) => { calls.push(`nickname:${nickname}`); },
        complete: async () => { calls.push("complete"); },
      },
    );

    expect(calls).toEqual([
      "avatar:wxfile://avatar.jpg",
      "nickname:小满",
      "complete",
    ]);
  });

  it("does not complete onboarding when an earlier save step fails", async () => {
    const calls: string[] = [];

    await expect(saveOnboardingDraft(
      { nickname: "小满", avatarTempPath: "wxfile://broken.jpg" },
      {
        saveAvatar: async () => { calls.push("avatar"); throw new Error("upload failed"); },
        saveNickname: async () => { calls.push("nickname"); },
        complete: async () => { calls.push("complete"); },
      },
    )).rejects.toThrow("upload failed");

    expect(calls).toEqual(["avatar"]);
  });

  it("skip only completes onboarding", async () => {
    const calls: string[] = [];

    await skipOnboarding({
      complete: async () => { calls.push("complete"); },
    });

    expect(calls).toEqual(["complete"]);
  });
});
