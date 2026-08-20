import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { createDish, requireAdmin } = vi.hoisted(() => ({
  createDish: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("../../../../../modules/admin/require-admin", () => ({ requireAdmin }));
vi.mock("../../../../../modules/menu/dish-service", () => ({
  createDish,
  listAdminDishes: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/v1/admin/dishes", () => {
  it("creates a validated dish", async () => {
    const id = "cmt0zapt70000wcmdx75rhyss";
    const input = {
      categoryId: id,
      description: "",
      imageUploadId: id,
      name: "番茄炒蛋",
      published: true,
      referencePriceCents: 1_800,
      sortOrder: 1,
    };
    requireAdmin.mockResolvedValue({ sub: "single-admin" });
    createDish.mockResolvedValue({ id: "dish-1" });
    const request = new NextRequest("https://menu.example/api/v1/admin/dishes", {
      body: JSON.stringify(input),
      method: "POST",
    });

    const response = await POST(request);

    expect(createDish).toHaveBeenCalledWith(input);
    expect(response.status).toBe(201);
  });
});
