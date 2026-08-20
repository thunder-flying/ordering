import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

import type { AuthSessionDto } from "@ordering/contracts";

import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { exchangeCode } from "./wechat-client";

const USER_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

function digestOpenid(openid: string): string {
  return createHmac("sha256", env.OPENID_HMAC_SECRET)
    .update(openid)
    .digest("base64url");
}

function issueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUserSessionToken(token: string): string {
  return createHash("sha256")
    .update(`${token}.${env.USER_SESSION_PEPPER}`)
    .digest("base64url");
}

export async function createUserSession(
  code: string,
): Promise<AuthSessionDto> {
  const { openid } = await exchangeCode(code);
  const openidDigest = digestOpenid(openid);
  const token = issueToken();
  const tokenHash = hashUserSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + USER_SESSION_DURATION_MS);

  const user = await prisma.$transaction(async (transaction) => {
    const currentUser = await transaction.user.upsert({
      where: { openidDigest },
      create: {
        firstLoginAt: now,
        lastLoginAt: now,
        openidDigest,
      },
      update: { lastLoginAt: now },
      select: {
        avatarUploadId: true,
        id: true,
        nickname: true,
        onboardingCompletedAt: true,
      },
    });

    await transaction.userSession.create({
      data: {
        expiresAt,
        tokenHash,
        userId: currentUser.id,
      },
    });

    return currentUser;
  });

  return {
    expiresAt: expiresAt.toISOString(),
    onboardingCompleted: user.onboardingCompletedAt !== null,
    profileComplete:
      user.avatarUploadId !== null && user.nickname !== "微信用户",
    token,
  };
}

export async function revokeUserSession(sessionId: string): Promise<void> {
  await prisma.userSession.deleteMany({ where: { id: sessionId } });
}
