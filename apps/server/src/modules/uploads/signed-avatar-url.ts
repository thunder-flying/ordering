import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../lib/env";

const SIGNED_AVATAR_LIFETIME_SECONDS = 10 * 60;

function signatureFor(storageKey: string, expires: number): string {
  return createHmac("sha256", env.USER_SESSION_PEPPER)
    .update(`${storageKey}.${expires}`)
    .digest("base64url");
}

export function createSignedAvatarUrl(
  storageKey: string,
  now = new Date(),
): string {
  const expires =
    Math.floor(now.getTime() / 1_000) + SIGNED_AVATAR_LIFETIME_SECONDS;
  const signature = signatureFor(storageKey, expires);
  return `/media/avatars/${encodeURIComponent(storageKey)}?expires=${expires}&signature=${signature}`;
}

export function verifySignedAvatarUrl(
  storageKey: string,
  expiresValue: string,
  signature: string,
  now = new Date(),
): boolean {
  if (!/^\d{10,12}$/.test(expiresValue) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return false;
  }

  const expires = Number(expiresValue);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    !Number.isSafeInteger(expires) ||
    expires < nowSeconds ||
    expires > nowSeconds + SIGNED_AVATAR_LIFETIME_SECONDS
  ) {
    return false;
  }

  const expected = Buffer.from(signatureFor(storageKey, expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
