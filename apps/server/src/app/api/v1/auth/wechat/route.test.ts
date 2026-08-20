import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUserSession } = vi.hoisted(() => ({
  createUserSession: vi.fn(),
}));

vi.mock("../../../../../modules/auth/session-service", () => ({
  createUserSession,
}));

import { POST } from "./route";

describe("POST /api/v1/auth/wechat", () => {
  beforeEach(() => {
    createUserSession.mockReset();
  });

  it("returns the newly issued session", async () => {
    createUserSession.mockResolvedValue({
      expiresAt: "2026-09-19T00:00:00.000Z",
      onboardingCompleted: false,
      profileComplete: false,
      token: "a".repeat(43),
    });
    const request = new NextRequest("http://localhost/api/v1/auth/wechat", {
      body: JSON.stringify({ code: "wx-code" }),
      headers: {
        "content-type": "application/json",
        "x-real-ip": "192.0.2.10",
      },
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(createUserSession).toHaveBeenCalledWith("wx-code");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { token: "a".repeat(43) },
    });
  });

  it("rejects an invalid request before calling WeChat", async () => {
    const request = new NextRequest("http://localhost/api/v1/auth/wechat", {
      body: JSON.stringify({ code: "" }),
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createUserSession).not.toHaveBeenCalled();
  });
});
