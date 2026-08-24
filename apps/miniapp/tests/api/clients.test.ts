import { beforeEach, describe, expect, it, vi } from "vitest";

const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }));
vi.mock("../../src/api/request", () => ({ request, upload }));

import { completeOnboarding, saveAvatar, updateNickname } from "../../src/api/profile";
import { addFavorite, fetchFavorites, removeFavorite } from "../../src/api/favorites";
import { copyList, createList, fetchLists, updateList } from "../../src/api/lists";
import { fetchDishAvailability, fetchDishes } from "../../src/api/menu";

const relativeImageDish = {
  id: "dish-1",
  categoryId: "cat-hot",
  name: "番茄牛腩",
  description: "慢炖至软嫩",
  imageUrl: "/media/dishes/beef.jpg",
  referencePriceCents: 2_680,
  sortOrder: 1,
};

beforeEach(() => {
  Object.assign(globalThis, {
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    },
  });
});

describe("typed miniapp API clients", () => {
  it("encodes menu queries", async () => {
    request.mockResolvedValueOnce({ items: [], nextCursor: null });
    await fetchDishes({ q: "辣 & 香", categoryId: "cat/one", cursor: "next?", limit: 20 });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/v1/dishes?q=%E8%BE%A3%20%26%20%E9%A6%99&categoryId=cat%2Fone&cursor=next%3F&limit=20" }));
  });

  it("marks only the read-only availability POST as replay safe", async () => {
    request.mockResolvedValueOnce({ items: [] });
    await fetchDishAvailability(["dish-1"]);
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/dishes/availability",
      data: { dishIds: ["dish-1"] },
      replaySafe: true,
    });
  });

  it("returns an absolute image URL for dishes from the menu endpoint", async () => {
    request.mockResolvedValueOnce({ items: [relativeImageDish], nextCursor: null });

    const response = await fetchDishes();

    expect(response.items[0]?.imageUrl).toBe("http://127.0.0.1:3000/media/dishes/beef.jpg");
  });

  it("returns an absolute image URL for available favorite dishes", async () => {
    request.mockResolvedValueOnce({
      items: [{ dishId: "dish-1", available: true, dish: relativeImageDish }],
    });

    const response = await fetchDishAvailability(["dish-1"]);

    expect(response.items[0]).toEqual(expect.objectContaining({
      available: true,
      dish: expect.objectContaining({
        imageUrl: "http://127.0.0.1:3000/media/dishes/beef.jpg",
      }),
    }));
  });

  it("uses only server-owned profile routes", async () => {
    request.mockResolvedValue(undefined);
    upload.mockResolvedValue(undefined);
    await updateNickname("  新名字  ");
    await saveAvatar("tmp/avatar.png");
    await completeOnboarding();
    expect(request).toHaveBeenNthCalledWith(1, { method: "PATCH", path: "/api/v1/profile", data: { nickname: "新名字" } });
    expect(upload).toHaveBeenCalledWith({ path: "/api/v1/profile/avatar", filePath: "tmp/avatar.png", name: "file" });
    expect(request).toHaveBeenNthCalledWith(2, { method: "POST", path: "/api/v1/profile/onboarding/complete" });
  });

  it("uses idempotent favorite routes", async () => {
    request.mockResolvedValue(undefined);
    await fetchFavorites({ cursor: "cursor value", limit: 20 });
    await addFavorite("dish/id");
    await removeFavorite("dish/id");
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: "/api/v1/favorites?cursor=cursor%20value&limit=20" }));
    expect(request).toHaveBeenNthCalledWith(2, { method: "PUT", path: "/api/v1/favorites/dish%2Fid" });
    expect(request).toHaveBeenNthCalledWith(3, { method: "DELETE", path: "/api/v1/favorites/dish%2Fid" });
  });

  it("omits client-owned prices and user IDs from list write payloads", async () => {
    request.mockResolvedValue(undefined);
    const item = { dishId: "dish-1", quantity: 2, note: "  少辣  ", referencePriceCents: 1299, userId: "forged" };
    await createList({ name: "  晚餐  ", idempotencyKey: "00000000-0000-4000-8000-000000000001", items: [item] });
    await updateList("list/id", { name: "晚餐", idempotencyKey: "00000000-0000-4000-8000-000000000001", expectedUpdatedAt: "2099-01-01T00:00:00.000Z", items: [item] });
    await copyList("list/id", { name: "复制", idempotencyKey: "00000000-0000-4000-8000-000000000001" });
    await fetchLists({ cursor: "cursor value", limit: 20 });
    expect(request).toHaveBeenNthCalledWith(1, { method: "POST", path: "/api/v1/lists", idempotencyKey: "00000000-0000-4000-8000-000000000001", data: { name: "晚餐", idempotencyKey: "00000000-0000-4000-8000-000000000001", items: [{ dishId: "dish-1", quantity: 2, note: "少辣" }] } });
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "PATCH", path: "/api/v1/lists/list%2Fid", data: expect.not.objectContaining({ userId: expect.anything(), referencePriceCents: expect.anything() }) }));
    expect(request).toHaveBeenNthCalledWith(3, { method: "POST", path: "/api/v1/lists/list%2Fid/copy", idempotencyKey: "00000000-0000-4000-8000-000000000001", data: { name: "复制", idempotencyKey: "00000000-0000-4000-8000-000000000001" } });
    expect(request).toHaveBeenNthCalledWith(4, expect.objectContaining({ path: "/api/v1/lists?cursor=cursor%20value&limit=20" }));
  });
});
