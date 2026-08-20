import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const pidFile = resolve(".playwright-server.pid");

export default async function globalSetup() {
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "localhost",
      "--port",
      "3011",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ADMIN_PASSWORD_HASH:
          "$argon2id$v=19$m=19456,t=2,p=1$zWKAy+nBBjCUzzgGR22guQ$S2EfXHtB+HQilWjVG7zi1z/dLiyUQi/hYgy1IdB6Aok",
        ADMIN_SESSION_SECRET: "test-admin-session-secret-32-chars",
        ADMIN_USERNAME: "admin",
        DATABASE_URL:
          "mysql://ordering:ordering_test_password@127.0.0.1:33070/ordering_test",
        NO_PROXY: "localhost,127.0.0.1",
        OPENID_HMAC_SECRET: "test-openid-hmac-secret-32-chars!",
        UPLOAD_ROOT: "./test-e2e-uploads",
        USER_SESSION_PEPPER: "test-user-session-pepper-32-chars!",
        WECHAT_APP_ID: "test-app-id",
        WECHAT_APP_SECRET: "test-app-secret",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (!server.pid) throw new Error("Could not start the Next.js test server");
  await writeFile(pidFile, String(server.pid), "utf8");

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js test server exited with ${server.exitCode}`);
    }
    try {
      const response = await fetch("http://localhost:3011/api/v1/health");
      if (response.ok) return;
    } catch {
      // The server has not bound its port yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error("Timed out waiting for the Next.js test server");
}
