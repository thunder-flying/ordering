import { describe, expect, it } from "vitest";

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  const rule = { limit: 10, windowMs: 60_000 };

  it("rejects the eleventh request in one window", () => {
    const key = "login:fixed-window";

    for (let index = 0; index < 10; index += 1) {
      expect(() => checkRateLimit(key, rule, 1_000)).not.toThrow();
    }

    expect(() => checkRateLimit(key, rule, 1_000)).toThrowError(
      expect.objectContaining({ code: "RATE_LIMITED", status: 429 }),
    );
  });

  it("resets the counter after the window", () => {
    const key = "login:reset-window";

    for (let index = 0; index < 10; index += 1) {
      checkRateLimit(key, rule, 5_000);
    }

    expect(() => checkRateLimit(key, rule, 65_000)).not.toThrow();
  });
});
