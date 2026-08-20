import "server-only";

import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";
import { hashUserSessionToken } from "./session-service";

export type AuthenticatedUser = {
  userId: string;
  sessionId: string;
};

const BEARER_TOKEN = /^Bearer ([A-Za-z0-9_-]{43})$/;

function unauthenticated(): ApiError {
  return new ApiError("UNAUTHENTICATED", "登录状态已失效，请重新登录", 401);
}

export async function requireUser(
  request: Request,
): Promise<AuthenticatedUser> {
  const match = BEARER_TOKEN.exec(request.headers.get("authorization") ?? "");

  if (!match?.[1]) {
    throw unauthenticated();
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashUserSessionToken(match[1]) },
    select: { expiresAt: true, id: true, userId: true },
  });
  const now = new Date();

  if (!session || session.expiresAt <= now) {
    throw unauthenticated();
  }

  const updated = await prisma.userSession.updateMany({
    where: { id: session.id, expiresAt: { gt: now } },
    data: { lastUsedAt: now },
  });

  if (updated.count !== 1) {
    throw unauthenticated();
  }

  return { sessionId: session.id, userId: session.userId };
}
