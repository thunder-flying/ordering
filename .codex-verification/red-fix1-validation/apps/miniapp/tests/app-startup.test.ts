import { afterEach, describe, expect, it, vi } from "vitest";

const { ensureSession } = vi.hoisted(() => ({ ensureSession: vi.fn() }));
vi.mock("../src/state/session", () => ({ ensureSession }));

const wxBoundary = { reLaunch: vi.fn() };
const appBoundary = vi.fn();

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

async function startWith(onboardingCompleted: boolean): Promise<void> {
  Object.assign(globalThis, { wx: wxBoundary, App: appBoundary });
  ensureSession.mockResolvedValueOnce({
    token: "stored",
    expiresAt: "2099-01-01T00:00:00.000Z",
    onboardingCompleted,
  });
  await import("../src/app");
  await Promise.resolve();
}

describe("miniapp startup routing", () => {
  it("keeps a completed user on the configured startup page", async () => {
    await startWith(true);
    expect(wxBoundary.reLaunch).not.toHaveBeenCalled();
  });

  it("redirects an incomplete user to onboarding", async () => {
    await startWith(false);
    expect(wxBoundary.reLaunch).toHaveBeenCalledWith({ url: "/pages/onboarding/index" });
  });
});
