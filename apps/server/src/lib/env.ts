import "server-only";

import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  OPENID_HMAC_SECRET: z.string().min(32),
  WECHAT_APP_ID: z.string().min(1),
  WECHAT_APP_SECRET: z.string().min(1),
  USER_SESSION_PEPPER: z.string().min(32),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  ADMIN_SESSION_SECRET: z.string().min(32),
  UPLOAD_ROOT: z.string().min(1),
});

type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= EnvSchema.parse(process.env);
  return cachedEnv;
}

export const env = new Proxy({} as Env, {
  get(_target, property: keyof Env) {
    return getEnv()[property];
  },
});
