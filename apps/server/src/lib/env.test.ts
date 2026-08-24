import { afterEach, describe, expect, it } from "vitest";

import { getEnv } from "./env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("server environment", () => {
  it("rejects the example WeChat credentials", () => {
    Object.assign(process.env, {
      ADMIN_PASSWORD_HASH: "a".repeat(20),
      ADMIN_SESSION_SECRET: "a".repeat(32),
      ADMIN_USERNAME: "admin",
      DATABASE_URL: "mysql://ordering:test@127.0.0.1:3306/ordering",
      OPENID_HMAC_SECRET: "a".repeat(32),
      UPLOAD_ROOT: "D:/ordering-data/uploads",
      USER_SESSION_PEPPER: "a".repeat(32),
      WECHAT_APP_ID: "replace-with-your-wechat-app-id",
      WECHAT_APP_SECRET: "replace-with-your-wechat-app-secret",
    });

    expect(() => getEnv()).toThrow();
  });
});
