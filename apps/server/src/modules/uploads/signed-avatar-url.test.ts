import { beforeAll, describe, expect, it } from "vitest";

import {
  createSignedAvatarUrl,
  verifySignedAvatarUrl,
} from "./signed-avatar-url";

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:3306/test";
  process.env.OPENID_HMAC_SECRET = "test-openid-hmac-secret-32-chars!";
  process.env.WECHAT_APP_ID = "test-app-id";
  process.env.WECHAT_APP_SECRET = "test-app-secret";
  process.env.USER_SESSION_PEPPER = "test-user-session-pepper-32-chars!";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=1,t=1,p=1$test$test";
  process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-32-chars";
  process.env.UPLOAD_ROOT = "./test-uploads";
});

describe("signed avatar URLs", () => {
  it("creates a URL valid for ten minutes", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    const url = createSignedAvatarUrl("avatar.png", now);
    const parsed = new URL(url, "https://menu.example");

    expect(
      verifySignedAvatarUrl(
        "avatar.png",
        parsed.searchParams.get("expires") ?? "",
        parsed.searchParams.get("signature") ?? "",
        new Date("2026-08-20T00:09:59.000Z"),
      ),
    ).toBe(true);
    expect(
      verifySignedAvatarUrl(
        "avatar.png",
        parsed.searchParams.get("expires") ?? "",
        parsed.searchParams.get("signature") ?? "",
        new Date("2026-08-20T00:10:01.000Z"),
      ),
    ).toBe(false);
  });

  it("rejects a tampered key", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    const parsed = new URL(
      createSignedAvatarUrl("avatar.png", now),
      "https://menu.example",
    );

    expect(
      verifySignedAvatarUrl(
        "other.png",
        parsed.searchParams.get("expires") ?? "",
        parsed.searchParams.get("signature") ?? "",
        now,
      ),
    ).toBe(false);
  });
});
