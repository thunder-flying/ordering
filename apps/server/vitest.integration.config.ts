import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    env: {
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$test$test",
      ADMIN_SESSION_SECRET: "test-admin-session-secret-32-chars",
      ADMIN_USERNAME: "admin",
      OPENID_HMAC_SECRET: "test-openid-hmac-secret-32-chars!",
      UPLOAD_ROOT: "./test-uploads",
      USER_SESSION_PEPPER: "test-user-session-pepper-32-chars!",
      WECHAT_APP_ID: "test-app-id",
      WECHAT_APP_SECRET: "test-app-secret",
    },
    env: {
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$test$test",
      ADMIN_SESSION_SECRET: "test-admin-session-secret-32-chars",
      ADMIN_USERNAME: "admin",
      OPENID_HMAC_SECRET: "test-openid-hmac-secret-32-chars!",
      UPLOAD_ROOT: "./test-uploads",
      USER_SESSION_PEPPER: "test-user-session-pepper-32-chars!",
      WECHAT_APP_ID: "test-app-id",
      WECHAT_APP_SECRET: "test-app-secret",
    },
    fileParallelism: false,
    include: ["tests/**/*.int.test.ts"],
  },
});
