import { describe, expect, it } from "vitest";

import { AdminLoginRequest } from "./admin-auth";

describe("AdminLoginRequest", () => {
  it("trims the username but preserves the password", () => {
    expect(
      AdminLoginRequest.parse({ username: " admin ", password: " pass " }),
    ).toEqual({ username: "admin", password: " pass " });
  });

  it("rejects unknown fields", () => {
    expect(() =>
      AdminLoginRequest.parse({
        username: "admin",
        password: "pass",
        role: "owner",
      }),
    ).toThrow();
  });
});
