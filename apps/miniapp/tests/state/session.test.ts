import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSession, ensureSession } from "../../src/state/session";

const wxBoundary = {
  request: vi.fn(),
  getStorageSync: vi.fn(),
  setStorageSync: vi.fn(),
  removeStorageSync: vi.fn(),
  login: vi.fn(),
};

function installWx() {
  Object.assign(globalThis, { wx: wxBoundary });
  wxBoundary.login.mockImplementation((options: { success: (reply: { code: string }) => void }) => options.success({ code: "wx-code" }));
  wxBoundary.request.mockImplementation((options: { success: (reply: unknown) => void }) => {
    options.success({ code: 200, message: "success", data: { token: "new-token", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: false } });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("versioned session", () => {
  it("reuses a valid stored session without logging in", async () => {
    installWx();
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stored", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));

    await expect(ensureSession()).resolves.toEqual({ token: "stored", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true });
    expect(wxBoundary.login).not.toHaveBeenCalled();
  });

  it("replaces expired and corrupt stored sessions", async () => {
    installWx();
    wxBoundary.getStorageSync.mockReturnValueOnce("not-json").mockReturnValueOnce(JSON.stringify({ token: "old", expiresAt: "2000-01-01T00:00:00.000Z", onboardingCompleted: true }));

    await expect(ensureSession()).resolves.toMatchObject({ token: "new-token" });
    await expect(ensureSession(true)).resolves.toMatchObject({ token: "new-token" });
    expect(wxBoundary.setStorageSync).toHaveBeenCalled();
  });

  it("shares concurrent silent login work", async () => {
    installWx();
    wxBoundary.getStorageSync.mockReturnValue(undefined);

    const [first, second] = await Promise.all([ensureSession(), ensureSession()]);
    expect(first.token).toBe("new-token");
    expect(second.token).toBe("new-token");
    expect(wxBoundary.login).toHaveBeenCalledOnce();
  });

  it("clears terminal session state", () => {
    installWx();

    clearSession();
    expect(wxBoundary.removeStorageSync).toHaveBeenCalledOnce();
  });
});
