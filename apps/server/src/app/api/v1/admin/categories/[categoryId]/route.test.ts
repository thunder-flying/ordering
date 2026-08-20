import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { requireAdmin, updateCategory } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateCategory: vi.fn(),
}));

vi.mock("../../../../../../modules/admin/require-admin", () => ({ requireAdmin }));
vi.mock("../../../../../../modules/menu/category-service", () => ({
  softDeleteCategory: vi.fn(),
  updateCategory,
}));

import { PATCH } from "./route";

describe("PATCH /api/v1/admin/categories/:categoryId", () => {
  it("passes the validated path and optimistic timestamp", async () => {
    const categoryId = "cmt0zapt70000wcmdx75rhyss";
    const expectedUpdatedAt = "2026-08-20T00:00:00.000Z";
    requireAdmin.mockResolvedValue({ sub: "single-admin" });
    updateCategory.mockResolvedValue({ id: categoryId });
    const request = new NextRequest(
      `https://menu.example/api/v1/admin/categories/${categoryId}`,
      {
        body: JSON.stringify({
          enabled: true,
          expectedUpdatedAt,
          name: "热菜",
          sortOrder: 1,
        }),
        method: "PATCH",
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ categoryId }),
    });

    expect(updateCategory).toHaveBeenCalledWith(categoryId, {
      enabled: true,
      expectedUpdatedAt,
      name: "热菜",
      sortOrder: 1,
    });
    expect(response.status).toBe(200);
  });
});
