import { hash } from "@node-rs/argon2";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

import {
  checkAdminLoginRateLimit,
  clearAdminCookie,
  createAdminSession,
} from "./admin-session";
import { requireAdmin } from "./require-admin";

beforeAll(async () => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  process.env.OPENID_HMAC_SECRET = "test-openid-hmac-secret-32-chars!";
  process.env.WECHAT_APP_ID = "test-app-id";
  process.env.WECHAT_APP_SECRET = "test-app-secret";
  process.env.USER_SESSION_PEPPER = "test-user-session-pepper-32-chars!";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH = await hash("correct-password");
  process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-32-chars";
  process.env.UPLOAD_ROOT = "./test-uploads";
});

describe("administrator sessions", () => {
  it("creates a hardened encrypted session cookie", async () => {
    const session = await createAdminSession("admin", "correct-password");

    expect(session.cookie).toContain("ordering_admin_session=");
    expect(session.cookie).toContain("HttpOnly");
    expect(session.cookie).toContain("Secure");
    expect(session.cookie).toContain("SameSite=Strict");
    expect(session.cookie).toContain("Path=/");
    expect(session.cookie).toContain("Max-Age=43200");
    expect(session.cookie).not.toContain("correct-password");
    expect(session.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns the same generic error for either incorrect credential", async () => {
    await expect(
      createAdminSession("someone", "correct-password"),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "用户名或密码不正确",
    });
    await expect(
      createAdminSession("admin", "wrong-password"),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "用户名或密码不正确",
    });
  });

  it("decrypts a valid cookie and verifies CSRF on mutations", async () => {
    const session = await createAdminSession("admin", "correct-password");
    const cookie = session.cookie.split(";", 1)[0]!;
    const request = new NextRequest("https://menu.example/api/v1/admin/test", {
      headers: {
        cookie,
        origin: "https://menu.example",
        "x-csrf-token": session.csrf,
      },
      method: "POST",
    });

    await expect(requireAdmin(request)).resolves.toMatchObject({
      csrf: session.csrf,
      sub: "single-admin",
    });
  });

  it("rejects missing CSRF and an unexpected origin", async () => {
    const session = await createAdminSession("admin", "correct-password");
    const cookie = session.cookie.split(";", 1)[0]!;
    const missingCsrf = new NextRequest(
      "https://menu.example/api/v1/admin/test",
      { headers: { cookie }, method: "POST" },
    );
    const wrongOrigin = new NextRequest(
      "https://menu.example/api/v1/admin/test",
      {
        headers: {
          cookie,
          origin: "https://evil.example",
          "x-csrf-token": session.csrf,
        },
        method: "POST",
      },
    );

    await expect(requireAdmin(missingCsrf)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(requireAdmin(wrongOrigin)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("limits login attempts by address and username", () => {
    const key = "198.51.100.9:admin";
    for (let index = 0; index < 5; index += 1) {
      checkAdminLoginRateLimit(key, 10_000);
    }

    expect(() => checkAdminLoginRateLimit(key, 10_000)).toThrowError(
      expect.objectContaining({ code: "RATE_LIMITED", status: 429 }),
    );
  });

  it("builds a hardened clearing cookie", () => {
    expect(clearAdminCookie()).toBe(
      "ordering_admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    );
  });
});
