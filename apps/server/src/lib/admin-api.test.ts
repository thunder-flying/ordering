import { afterEach, describe, expect, it, vi } from "vitest";

import { adminFetch, AdminApiError } from "./admin-api";

describe("adminFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data from a successful RESTful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          code: 200,
          message: "success",
          data: { id: "dish-1" },
        }),
      ),
    );

    await expect(adminFetch<{ id: string }>("/api/v1/admin/dishes/dish-1"))
      .resolves.toEqual({ id: "dish-1" });
  });

  it("throws a numeric API error and preserves X-Request-ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { code: 401, message: "请先登录", data: null },
          {
            headers: { "X-Request-ID": "client-request-123" },
            status: 401,
          },
        ),
      ),
    );

    const error = await adminFetch("/api/v1/admin/session").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      code: 401,
      message: "请先登录",
      requestId: "client-request-123",
      status: 401,
    });
  });

  it("rejects a response whose body code differs from its HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          code: 201,
          message: "success",
          data: { id: "dish-1" },
        }),
      ),
    );

    await expect(adminFetch("/api/v1/admin/dishes/dish-1")).rejects.toMatchObject({
      code: 200,
      message: "服务响应格式不正确",
      status: 200,
    });
  });
});
