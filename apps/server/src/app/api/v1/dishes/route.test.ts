import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { searchPublicDishes } = vi.hoisted(() => ({
  searchPublicDishes: vi.fn(),
}));

vi.mock("../../../../modules/menu/menu-query", () => ({ searchPublicDishes }));

import { GET } from "./route";

describe("GET /api/v1/dishes", () => {
  it("validates query parameters before searching", async () => {
    searchPublicDishes.mockResolvedValue({ items: [], nextCursor: null });
    const response = await GET(
      new NextRequest("http://localhost/api/v1/dishes?q=%20%E7%95%AA%E8%8C%84%20&limit=5"),
    );

    expect(searchPublicDishes).toHaveBeenCalledWith({ q: "番茄", limit: 5 });
    expect(await response.json()).toEqual({
      code: 200,
      message: "success",
      data: { items: [], nextCursor: null },
    });
  });
});
