import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkAdminLoginRateLimit,
  clearAdminCookie,
  createAdminSession,
  requireAdmin,
} = vi.hoisted(() => ({
  checkAdminLoginRateLimit: vi.fn(),
  clearAdminCookie: vi.fn(),
  createAdminSession: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("../../../../../modules/admin/admin-session", () => ({
  checkAdminLoginRateLimit,
  clearAdminCookie,
  createAdminSession,
}));
vi.mock("../../../../../modules/admin/require-admin", () => ({ requireAdmin }));

import { DELETE, GET, POST } from "./route";

describe("/api/v1/admin/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the hardened cookie after login", async () => {
    createAdminSession.mockResolvedValue({
      cookie: "ordering_admin_session=encrypted; HttpOnly; Secure",
      csrf: "c".repeat(43),
      expiresAt: "2026-08-20T12:00:00.000Z",
    });
    const request = new NextRequest("https://menu.example/api/v1/admin/session", {
      body: JSON.stringify({ username: "admin", password: "password" }),
      headers: { "x-real-ip": "192.0.2.20" },
      method: "POST",
    });

    const response = await POST(request);

    expect(checkAdminLoginRateLimit).toHaveBeenCalledWith(
      "192.0.2.20:admin",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "ordering_admin_session=encrypted",
    );
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        csrfToken: "c".repeat(43),
        expiresAt: "2026-08-20T12:00:00.000Z",
      },
    });
  });

  it("returns the current CSRF token on GET", async () => {
    requireAdmin.mockResolvedValue({
      csrf: "d".repeat(43),
      exp: 1_787_227_200,
      sub: "single-admin",
    });
    const request = new NextRequest("https://menu.example/api/v1/admin/session");

    const response = await GET(request);

    expect(await response.json()).toEqual({
      ok: true,
      data: {
        csrfToken: "d".repeat(43),
        expiresAt: new Date(1_787_227_200 * 1_000).toISOString(),
      },
    });
  });

  it("expires the cookie after authenticated logout", async () => {
    requireAdmin.mockResolvedValue({
      csrf: "e".repeat(43),
      exp: 1_787_227_200,
      sub: "single-admin",
    });
    clearAdminCookie.mockReturnValue(
      "ordering_admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    );
    const request = new NextRequest("https://menu.example/api/v1/admin/session", {
      method: "DELETE",
    });

    const response = await DELETE(request);

    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.json()).toEqual({
      ok: true,
      data: { success: true },
    });
  });
});
