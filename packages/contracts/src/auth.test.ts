import { describe, expect, it } from "vitest";

import { WechatLoginRequest } from "./auth";

describe("WechatLoginRequest", () => {
  it("trims and accepts a non-empty wx.login code", () => {
    expect(WechatLoginRequest.parse({ code: "  code-123  " })).toEqual({
      code: "code-123",
    });
  });

  it("rejects empty and unknown fields", () => {
    expect(() => WechatLoginRequest.parse({ code: "" })).toThrow();
    expect(() =>
      WechatLoginRequest.parse({ code: "ok", openid: "forbidden" }),
    ).toThrow();
  });
});
