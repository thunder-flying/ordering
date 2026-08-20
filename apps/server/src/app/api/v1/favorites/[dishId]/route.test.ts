import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { addFavorite, requireUser } = vi.hoisted(() => ({
  addFavorite: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("../../../../../modules/auth/require-user", () => ({ requireUser }));
vi.mock("../../../../../modules/favorites/favorite-service", () => ({
  addFavorite,
  removeFavorite: vi.fn(),
}));

import { PUT } from "./route";

describe("PUT /api/v1/favorites/:dishId", () => {
  it("derives ownership only from the bearer session", async () => {
    const dishId = "cmt0zapt70000wcmdx75rhyss";
    requireUser.mockResolvedValue({ sessionId: "session-a", userId: "user-a" });
    addFavorite.mockResolvedValue({ dishId, favorited: true });
    const request = new NextRequest(`http://localhost/api/v1/favorites/${dishId}`, {
      method: "PUT",
    });

    const response = await PUT(request, {
      params: Promise.resolve({ dishId }),
    });

    expect(addFavorite).toHaveBeenCalledWith("user-a", dishId);
    expect(await response.json()).toEqual({
      ok: true,
      data: { dishId, favorited: true },
    });
  });
});
