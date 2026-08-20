import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/env", () => ({
  env: {
    WECHAT_APP_ID: "wx-test-app",
    WECHAT_APP_SECRET: "never-log-this-app-secret",
  },
}));

import { exchangeCode } from "./wechat-client";

describe("exchangeCode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges the temporary code at the official WeChat endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ openid: "openid-123", session_key: "ignored" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeCode("temporary-code")).resolves.toEqual({
      openid: "openid-123",
    });

    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(`${calledUrl.origin}${calledUrl.pathname}`).toBe(
      "https://api.weixin.qq.com/sns/jscode2session",
    );
    expect(Object.fromEntries(calledUrl.searchParams)).toEqual({
      appid: "wx-test-app",
      secret: "never-log-this-app-secret",
      js_code: "temporary-code",
      grant_type: "authorization_code",
    });
  });

  it("maps upstream errors without exposing secrets or response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ errcode: 40029, errmsg: "secret-upstream-body" }),
          { status: 200 },
        ),
      ),
    );

    let caught: unknown;
    try {
      await exchangeCode("invalid-code");
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "WECHAT_UNAVAILABLE",
      status: 502,
    });
    expect(String(caught)).not.toContain("secret-upstream-body");
    expect(String(caught)).not.toContain("never-log-this-app-secret");
  });
});
