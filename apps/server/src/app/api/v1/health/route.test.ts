import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("../../../../lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw },
}));

import { GET } from "./route";

describe("GET /api/v1/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("returns ok after a successful database probe", async () => {
    queryRaw.mockResolvedValue([{ result: 1 }]);

    const response = await GET(
      new NextRequest("http://localhost/api/v1/health"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: 200,
      message: "success",
      data: { status: "ok" },
    });
  });

  it("returns unavailable without leaking the database error", async () => {
    queryRaw.mockRejectedValue(new Error("mysql://secret"));

    const response = await GET(
      new NextRequest("http://localhost/api/v1/health"),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({
      code: 503,
      message: "服务暂时不可用",
      data: null,
    });
    expect(body).not.toContain("mysql://secret");
  });
});
