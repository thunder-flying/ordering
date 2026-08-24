import { afterEach, describe, expect, it, vi } from "vitest";

import { markOnboardingCompleted } from "../../src/state/session";

const wxBoundary = { getStorageSync: vi.fn(), setStorageSync: vi.fn() };
afterEach(() => vi.restoreAllMocks());

describe("session onboarding update", () => {
  it("updates only onboarding state without exposing or replacing credentials", async () => {
    Object.assign(globalThis, { wx: wxBoundary });
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stored", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: false }));
    await expect(markOnboardingCompleted()).resolves.toBeUndefined();
    expect(wxBoundary.setStorageSync).toHaveBeenCalledWith("ordering.session.v1", JSON.stringify({ token: "stored", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));
  });
});
