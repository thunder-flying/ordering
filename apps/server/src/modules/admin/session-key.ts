import "server-only";

import { createHash } from "node:crypto";

import { env } from "../../lib/env";

export function adminSessionKey(): Uint8Array {
  return createHash("sha256").update(env.ADMIN_SESSION_SECRET).digest();
}
