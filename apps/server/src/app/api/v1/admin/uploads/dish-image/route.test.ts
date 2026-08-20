import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { requireAdmin, storeDishImage } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  storeDishImage: vi.fn(),
}));

vi.mock("../../../../../../modules/admin/require-admin", () => ({ requireAdmin }));
vi.mock("../../../../../../modules/uploads/upload-service", () => ({
  storeDishImage,
}));

import { POST } from "./route";

describe("POST /api/v1/admin/uploads/dish-image", () => {
  it("stores one authenticated multipart image", async () => {
    requireAdmin.mockResolvedValue({ sub: "single-admin" });
    storeDishImage.mockResolvedValue({
      bytes: 68,
      id: "upload-1",
      mediaType: "image/png",
      previewUrl: "/media/dishes/key.png",
    });
    const form = new FormData();
    form.append("file", new File(["png"], "dish.png", { type: "image/png" }));
    const request = new NextRequest(
      "https://menu.example/api/v1/admin/uploads/dish-image",
      { body: form, method: "POST" },
    );

    const response = await POST(request);

    expect(requireAdmin).toHaveBeenCalledWith(request);
    expect(storeDishImage).toHaveBeenCalledWith(expect.any(File));
    expect(response.status).toBe(201);
  });
});
