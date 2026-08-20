import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, revokeUserSession } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revokeUserSession: vi.fn(),
}));

vi.mock("../../../../../modules/auth/require-user", () => ({ requireUser }));
vi.mock("../../../../../modules/auth/session-service", () => ({
  revokeUserSession,
}));

import { DELETE } from "./route";

describe("DELETE /api/v1/auth/logout", () => {
  beforeEach(() => {
    requireUser.mockReset();
    revokeUserSession.mockReset();
  });

  it("revokes only the authenticated session", async () => {
    requireUser.mockResolvedValue({ sessionId: "session-1", userId: "user-1" });
    const request = new NextRequest("http://localhost/api/v1/auth/logout", {
      method: "DELETE",
    });

    const response = await DELETE(request);

    expect(revokeUserSession).toHaveBeenCalledWith("session-1");
    expect(await response.json()).toEqual({
      ok: true,
      data: { success: true },
    });
  });
});
