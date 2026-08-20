import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { createCategory, requireAdmin } = vi.hoisted(() => ({
  createCategory: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("../../../../../modules/admin/require-admin", () => ({ requireAdmin }));
vi.mock("../../../../../modules/menu/category-service", () => ({
  createCategory,
  listAdminCategories: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/v1/admin/categories", () => {
  it("authenticates and creates a validated category", async () => {
    requireAdmin.mockResolvedValue({ sub: "single-admin" });
    createCategory.mockResolvedValue({ id: "category-1" });
    const request = new NextRequest(
      "https://menu.example/api/v1/admin/categories",
      {
        body: JSON.stringify({ name: " 热菜 ", sortOrder: 1, enabled: true }),
        method: "POST",
      },
    );

    const response = await POST(request);

    expect(requireAdmin).toHaveBeenCalledWith(request);
    expect(createCategory).toHaveBeenCalledWith({
      name: "热菜",
      sortOrder: 1,
      enabled: true,
    });
    expect(response.status).toBe(201);
  });
});
