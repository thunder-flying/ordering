import { afterEach, describe, expect, it, vi } from "vitest";

import { loginWithWechat } from "../../src/api/auth";

const wxBoundary = { login: vi.fn(), request: vi.fn() };

afterEach(() => vi.restoreAllMocks());

describe("WeChat login API", () => {
  it("posts the login code to the versioned auth route", async () => {
    Object.assign(globalThis, { wx: wxBoundary });
    wxBoundary.login.mockImplementation((options: { success: (reply: { code: string }) => void }) => options.success({ code: "wechat-code" }));
    wxBoundary.request.mockImplementation((options: { success: (reply: unknown) => void }) => {
      options.success({ code: 200, message: "success", data: { token: "token", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true } });
    });

    await expect(loginWithWechat()).resolves.toMatchObject({ onboardingCompleted: true });
    expect(wxBoundary.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://127.0.0.1:3000/api/v1/auth/wechat", method: "POST", data: { code: "wechat-code" },
    }));
  });
});
