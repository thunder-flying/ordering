import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { requireUser } from "../../src/modules/auth/require-user";
import {
  createUserSession,
  revokeUserSession,
} from "../../src/modules/auth/session-service";
import { resetDatabase } from "../helpers/database";

const { exchangeCode } = vi.hoisted(() => ({ exchangeCode: vi.fn() }));

vi.mock("../../src/modules/auth/wechat-client", () => ({ exchangeCode }));

function bearer(token: string) {
  return new NextRequest("http://localhost/api/v1/private", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("user sessions", () => {
  beforeEach(async () => {
    await resetDatabase();
    exchangeCode.mockReset();
    exchangeCode.mockResolvedValue({ openid: "raw-openid-user-a" });
  });

  it("stores only digests and maps repeated login to one user", async () => {
    const first = await createUserSession("code-one");
    const second = await createUserSession("code-two");
    const users = await prisma.user.findMany();
    const sessions = await prisma.userSession.findMany();

    expect(users).toHaveLength(1);
    expect(sessions).toHaveLength(2);
    expect(users[0]?.openidDigest).not.toContain("raw-openid-user-a");
    expect(sessions.map((session) => session.tokenHash)).not.toContain(
      first.token,
    );
    expect(sessions.map((session) => session.tokenHash)).not.toContain(
      second.token,
    );
    expect(first).toMatchObject({
      onboardingCompleted: false,
      profileComplete: false,
    });
  });

  it("authenticates an unexpired bearer token", async () => {
    const session = await createUserSession("code");

    await expect(requireUser(bearer(session.token))).resolves.toMatchObject({
      sessionId: expect.any(String),
      userId: expect.any(String),
    });
  });

  it("rejects an expired session", async () => {
    const session = await createUserSession("code");
    await prisma.userSession.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    await expect(requireUser(bearer(session.token))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("revokes only the selected session", async () => {
    const first = await createUserSession("code-one");
    const second = await createUserSession("code-two");
    const current = await requireUser(bearer(first.token));

    await revokeUserSession(current.sessionId);

    await expect(requireUser(bearer(first.token))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(requireUser(bearer(second.token))).resolves.toMatchObject({
      userId: current.userId,
    });
  });
});
