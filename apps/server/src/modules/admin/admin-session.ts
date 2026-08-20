import "server-only";

import { randomBytes } from "node:crypto";

import { verify } from "@node-rs/argon2";
import { EncryptJWT } from "jose";

import { env } from "../../lib/env";
import { ApiError } from "../../lib/http/api-error";
import { checkRateLimit } from "../../lib/security/rate-limit";
import { adminSessionKey } from "./session-key";

export const ADMIN_COOKIE_NAME = "ordering_admin_session";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

const LOGIN_RATE_RULE = { limit: 5, windowMs: 15 * 60 * 1_000 };

function invalidCredentials(): ApiError {
  return new ApiError("UNAUTHENTICATED", "用户名或密码不正确", 401);
}

export function checkAdminLoginRateLimit(key: string, now = Date.now()): void {
  checkRateLimit(`admin-login:${key}`, LOGIN_RATE_RULE, now);
}

export async function createAdminSession(
  username: string,
  password: string,
): Promise<{ cookie: string; csrf: string; expiresAt: string }> {
  let passwordMatches = false;

  try {
    passwordMatches = await verify(env.ADMIN_PASSWORD_HASH, password);
  } catch {
    throw new Error("ADMIN_PASSWORD_HASH is not a valid Argon2 hash");
  }

  if (!passwordMatches || username !== env.ADMIN_USERNAME) {
    throw invalidCredentials();
  }

  const csrf = randomBytes(32).toString("base64url");
  const expiresAtSeconds = Math.floor(Date.now() / 1_000) + ADMIN_SESSION_SECONDS;
  const token = await new EncryptJWT({ csrf })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject("single-admin")
    .setIssuer("ordering-server")
    .setAudience("ordering-admin")
    .setIssuedAt()
    .setExpirationTime(expiresAtSeconds)
    .encrypt(adminSessionKey());

  return {
    cookie: `${ADMIN_COOKIE_NAME}=${token}; Max-Age=${ADMIN_SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`,
    csrf,
    expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
  };
}

export function clearAdminCookie(): string {
  return `${ADMIN_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
