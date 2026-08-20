import { WechatLoginRequest } from "@ordering/contracts";

import { route } from "../../../../../lib/http/handler";
import { parseJson } from "../../../../../lib/http/json";
import { checkRateLimit } from "../../../../../lib/security/rate-limit";
import { createUserSession } from "../../../../../modules/auth/session-service";

const LOGIN_RATE_RULE = { limit: 10, windowMs: 60_000 };
const SAFE_ADDRESS = /^[0-9A-Fa-f:.]{1,64}$/;

function sourceAddress(request: Request): string {
  const forwarded = request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && SAFE_ADDRESS.test(forwarded) ? forwarded : "unknown";
}

export const POST = route(async (request) => {
  checkRateLimit(`wechat-login:${sourceAddress(request)}`, LOGIN_RATE_RULE);
  const input = await parseJson(request, WechatLoginRequest);
  return createUserSession(input.code);
});
