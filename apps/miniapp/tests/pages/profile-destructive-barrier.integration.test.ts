import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchFavorites, addFavorite, removeFavorite } = vi.hoisted(() => ({
  fetchFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock("../../src/api/favorites", () => ({ fetchFavorites, addFavorite, removeFavorite }));

import { runClearPrivateData } from "../../src/pages/profile/model";
import {
  blockFavoriteMutations,
  clearFavorites,
  getFavoriteState,
  setFavorite,
  settleFavoriteMutations,
} from "../../src/state/favorites";

const wxBoundary = {
  getStorageSync: vi.fn(),
  setStorageSync: vi.fn(),
  removeStorageSync: vi.fn(),
};

afterEach(() => {
  clearFavorites();
  vi.restoreAllMocks();
});

describe("profile destructive favorite barrier integration", () => {
  it("cancels a favorite intent queued during successful private-data clearing", async () => {
    Object.assign(globalThis, { wx: wxBoundary });
    wxBoundary.getStorageSync.mockReturnValue(undefined);
    addFavorite.mockResolvedValueOnce(undefined);
    let queuedIntent: Promise<void> | undefined;

    await expect(runClearPrivateData({
      confirm: async () => true,
      blockFavorites: () => {
        const release = blockFavoriteMutations();
        queuedIntent = setFavorite("dish-1", true);
        return release;
      },
      settleFavorites: settleFavoriteMutations,
      clearRemote: async () => undefined,
      clearDraft: () => undefined,
      clearFavorites,
    })).resolves.toEqual({ status: "cleared" });

    expect(queuedIntent).toBeDefined();
    wxBoundary.setStorageSync.mockClear();
    await expect(queuedIntent).rejects.toMatchObject({
      name: "FavoriteMutationCanceledError",
      message: "收藏操作已取消",
    });
    expect(addFavorite).not.toHaveBeenCalled();
    expect(getFavoriteState()).toMatchObject({ ids: new Set(), pending: new Set() });
    expect(wxBoundary.setStorageSync).not.toHaveBeenCalled();
  });
});
