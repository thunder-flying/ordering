import { describe, expect, it } from "vitest";

import { apiFailure, apiSuccess } from "./result";

describe("API response builders", () => {
  it("wraps a default 200 success response", () => {
    expect(apiSuccess({ id: "dish-1" })).toEqual({
      code: 200,
      message: "success",
      data: { id: "dish-1" },
    });
  });

  it("uses an explicit successful HTTP status", () => {
    expect(apiSuccess({ id: "dish-1" }, 201)).toEqual({
      code: 201,
      message: "success",
      data: { id: "dish-1" },
    });
  });

  it("uses the HTTP error status and null data", () => {
    expect(apiFailure(400, "名称不能为空")).toEqual({
      code: 400,
      message: "名称不能为空",
      data: null,
    });
  });
});
