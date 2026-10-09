import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileDto } from "@ordering/contracts";
import { completeOnboarding, fetchProfile, saveAvatar, updateNickname } from "../../src/api/profile";

vi.mock("../../src/api/request", () => ({
  request: vi.fn(),
  upload: vi.fn(),
}));
import { request, upload } from "../../src/api/request";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("profile avatar URLs", () => {
  const operations = [
    ["load", () => fetchProfile()],
    ["upload", () => saveAvatar("wxfile://avatar.jpg")],
    ["nickname", () => updateNickname("小满")],
    ["onboarding", () => completeOnboarding()],
  ] as const;

  it.each(operations)("resolves the signed avatar URL after %s", async (_name: string, operation: () => Promise<ProfileDto>) => {
    vi.stubGlobal("wx", { getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }) });
    const profile: ProfileDto = {
      nickname: "小满", avatarUrl: "/media/avatars/avatar.jpg?expires=1791500000&signature=abc",
      profileComplete: true, onboardingCompleted: true,
    };
    vi.mocked(request).mockResolvedValue(profile);
    vi.mocked(upload).mockResolvedValue(profile);
    expect(await operation()).toEqual({
      ...profile,
      avatarUrl: "https://api.guziyi.cn/media/avatars/avatar.jpg?expires=1791500000&signature=abc",
    });
    expect(profile.avatarUrl).toBe("/media/avatars/avatar.jpg?expires=1791500000&signature=abc");
  });

  it.each([null, "https://example.test/avatar.jpg"])("preserves avatar URL %s", async (avatarUrl: string | null) => {
    const profile: ProfileDto = { nickname: "微信用户", avatarUrl, profileComplete: false, onboardingCompleted: false };
    vi.mocked(request).mockResolvedValue(profile);
    expect(await fetchProfile()).toEqual(profile);
  });
});
