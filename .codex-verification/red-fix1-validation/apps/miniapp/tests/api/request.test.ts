import { afterEach, describe, expect, it, vi } from "vitest";
import { toApiUrl } from "../../src/config";
import { request } from "../../src/api/request";
import { newIdempotencyKey } from "../../src/utils/idempotency";

type RequestReply = { code: number; message: string; data: unknown; header?: Record<string, string> };
const wxBoundary = { request: vi.fn(), uploadFile: vi.fn(), getStorageSync: vi.fn(), setStorageSync: vi.fn(), removeStorageSync: vi.fn(), login: vi.fn() };

function installWx(replies: RequestReply[]) {
  Object.assign(globalThis, { wx: wxBoundary });
  wxBoundary.request.mockImplementation((options: { success: (reply: { data: RequestReply; header?: Record<string, string> }) => void }) => {
    const reply = replies.shift()!;
    options.success({ data: reply, ...(reply.header ? { header: reply.header } : {}) });
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

describe("authenticated request replay", () => {
  it("relogs once and replays a GET after terminal authentication", async () => {
    installWx([
      { code: 401, message: "session expired", data: null },
      { code: 200, message: "success", data: { token: "fresh", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true } },
      { code: 200, message: "success", data: { id: "dish-1" } },
    ]);
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stale", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));
    wxBoundary.login.mockImplementation((options: { success: (reply: { code: string }) => void }) => options.success({ code: "wx-code" }));
    await expect(request<{ id: string }>({ method: "GET", path: "/api/v1/dishes" })).resolves.toEqual({ id: "dish-1" });
    expect(wxBoundary.request).toHaveBeenCalledTimes(3);
    expect(wxBoundary.removeStorageSync).toHaveBeenCalledOnce();
  });

  it("replays an explicitly safe read-only POST once after a 401", async () => {
    installWx([
      { code: 401, message: "session expired", data: null },
      { code: 200, message: "success", data: { token: "fresh", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true } },
      { code: 200, message: "success", data: { items: [{ dishId: "dish-1", available: false }] } },
    ]);
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stale", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));
    wxBoundary.login.mockImplementation((options: { success: (reply: { code: string }) => void }) => options.success({ code: "wx-code" }));

    await expect(request({
      method: "POST",
      path: "/api/v1/dishes/availability",
      data: { dishIds: ["dish-1"] },
      replaySafe: true,
    })).resolves.toEqual({ items: [{ dishId: "dish-1", available: false }] });
    expect(wxBoundary.request).toHaveBeenCalledTimes(3);
    expect(wxBoundary.login).toHaveBeenCalledOnce();
  });

  it("surfaces the second 401 from a replay-safe POST instead of retrying indefinitely", async () => {
    installWx([
      { code: 401, message: "session expired", data: null },
      { code: 200, message: "success", data: { token: "fresh", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true } },
      { code: 401, message: "still expired", data: null },
    ]);
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stale", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));
    wxBoundary.login.mockImplementation((options: { success: (reply: { code: string }) => void }) => options.success({ code: "wx-code" }));

    await expect(request({
      method: "POST",
      path: "/api/v1/dishes/availability",
      data: { dishIds: ["dish-1"] },
      replaySafe: true,
    })).rejects.toMatchObject({ status: 401, message: "still expired" });
    expect(wxBoundary.request).toHaveBeenCalledTimes(3);
    expect(wxBoundary.login).toHaveBeenCalledOnce();
  });

  it("refuses to replay a mutation without an idempotency key", async () => {
    installWx([{ code: 401, message: "session expired", data: null }]);
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stale", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));
    await expect(request({ method: "POST", path: "/api/v1/lists", data: { name: "今晚" } })).rejects.toMatchObject({ status: 401 });
    expect(wxBoundary.login).not.toHaveBeenCalled();
  });

  it("replays an idempotent mutation at most once", async () => {
    installWx([
      { code: 401, message: "session expired", data: null },
      { code: 200, message: "success", data: { token: "fresh", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true } },
      { code: 401, message: "still expired", data: null },
    ]);
    wxBoundary.getStorageSync.mockReturnValue(JSON.stringify({ token: "stale", expiresAt: "2099-01-01T00:00:00.000Z", onboardingCompleted: true }));
    wxBoundary.login.mockImplementation((options: { success: (reply: { code: string }) => void }) => options.success({ code: "wx-code" }));
    await expect(request({ method: "POST", path: "/api/v1/lists", data: { name: "今晚" }, idempotencyKey: "idem-1" })).rejects.toMatchObject({ status: 401 });
    expect(wxBoundary.request).toHaveBeenCalledTimes(3);
  });
});

describe("request boundaries", () => {
  it("rejects arbitrary origins, non-versioned paths, and normalization bypasses before a network call", async () => {
    installWx([]);
    const rejected = ["https://evil.example/api/v1/lists", "/api/legacy", "//evil.example/api/v1/lists", "/api/v1/../legacy", "/api/v1/%2e%2e/legacy", "/api/v1/%2E%2E/legacy", "/api/v1\\..\\legacy"];
    for (const path of rejected) await expect(request({ method: "GET", path })).rejects.toThrow("relative /api/v1 path");
    expect(() => toApiUrl("/api/v1/dishes?q=%E8%BE%A3")).not.toThrow();
    expect(wxBoundary.request).not.toHaveBeenCalled();
  });

  it("generates distinct non-empty idempotency keys", () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).toMatch(/^[a-z0-9-]+$/i);
    expect(second).not.toBe(first);
  });
});
