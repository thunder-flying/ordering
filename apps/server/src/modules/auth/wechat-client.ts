import "server-only";

import { env } from "../../lib/env";
import { ApiError } from "../../lib/http/api-error";

const WECHAT_CODE_SESSION_URL =
  "https://api.weixin.qq.com/sns/jscode2session";

export async function exchangeCode(code: string): Promise<{ openid: string }> {
  const url = new URL(WECHAT_CODE_SESSION_URL);
  url.searchParams.set("appid", env.WECHAT_APP_ID);
  url.searchParams.set("secret", env.WECHAT_APP_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload: unknown = await response.json();

    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload === null ||
      "errcode" in payload ||
      !("openid" in payload) ||
      typeof payload.openid !== "string" ||
      payload.openid.length === 0
    ) {
      throw new Error("WeChat rejected the code exchange");
    }

    return { openid: payload.openid };
  } catch {
    throw new ApiError(
      "WECHAT_UNAVAILABLE",
      "微信登录服务暂时不可用，请稍后重试",
      502,
    );
  }
}
