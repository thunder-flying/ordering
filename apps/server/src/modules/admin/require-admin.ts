import "server-only";

import { timingSafeEqual } from "node:crypto";

import { jwtDecrypt } from "jose";
import type { NextRequest } from "next/server";

import { ApiError } from "../../lib/http/api-error";
import { ADMIN_COOKIE_NAME } from "./admin-session";
import { adminSessionKey } from "./session-key";

export type AdminClaims = {
  sub: "single-admin";
  exp: number;
  csrf: string;
};

function unauthenticated(): ApiError {
  return new ApiError("UNAUTHENTICATED", "管理员登录状态已失效", 401);
}

function forbidden(): ApiError {
  return new ApiError("FORBIDDEN", "请求来源或安全令牌无效", 403);
}

function sameSecret(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first);
  const secondBytes = Buffer.from(second);
  return (
    firstBytes.length === secondBytes.length &&
    timingSafeEqual(firstBytes, secondBytes)
  );
}

function verifyMutation(request: NextRequest, csrf: string): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return;
  }

  const suppliedCsrf = request.headers.get("x-csrf-token");
  if (!suppliedCsrf || !sameSecret(suppliedCsrf, csrf)) {
    throw forbidden();
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    throw forbidden();
  }
}

export async function requireAdmin(
  request: NextRequest,
): Promise<AdminClaims> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) {
    throw unauthenticated();
  }

  try {
    const { payload } = await jwtDecrypt(token, adminSessionKey(), {
      audience: "ordering-admin",
      issuer: "ordering-server",
    });

    if (
      payload.sub !== "single-admin" ||
      typeof payload.exp !== "number" ||
      typeof payload.csrf !== "string" ||
      payload.csrf.length !== 43
    ) {
      throw unauthenticated();
    }

    verifyMutation(request, payload.csrf);
    return {
      csrf: payload.csrf,
      exp: payload.exp,
      sub: "single-admin",
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw unauthenticated();
  }
}
