import { describe, expect, it } from "vitest";

import { apiFailure, apiSuccess } from "./result";

describe("API result envelope", () => {
  it("keeps success data separate from failure details", () => {
    expect(apiSuccess({ id: "dish-1" })).toEqual({
      ok: true,
      data: { id: "dish-1" },
    });

    expect(
      apiFailure("VALIDATION_ERROR", "名称不能为空", "request-1"),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "名称不能为空",
        requestId: "request-1",
      },
    });
  });
});
