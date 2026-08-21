import { describe, expect, it } from "vitest";

import { jsonFailure, jsonSuccess } from "./response";

describe("JSON response helpers", () => {
  it("derives the body code from a 201 response status", async () => {
    const response = jsonSuccess(
      { id: "dish-1" },
      { headers: { "x-test": "kept" }, status: 201 },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("kept");
    expect(await response.json()).toEqual({
      code: 201,
      message: "success",
      data: { id: "dish-1" },
    });
  });

  it("derives an error body from the supplied status", async () => {
    const response = jsonFailure(503, "服务暂时不可用");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 503,
      message: "服务暂时不可用",
      data: null,
    });
  });
});
