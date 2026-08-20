import { defineConfig, devices } from "@playwright/test";

process.env.NO_PROXY = "localhost,127.0.0.1";

export default defineConfig({
  expect: { timeout: 8_000 },
  fullyParallel: false,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  reporter: [["list"]],
  testDir: "./tests/e2e",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3011",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  workers: 1,
});
