import { afterEach, describe, expect, it, vi } from "vitest";
const { fetchFavorites, addFavorite, removeFavorite } = vi.hoisted(() => ({ fetchFavorites: vi.fn(), addFavorite: vi.fn(), removeFavorite: vi.fn() }));
vi.mock("../../src/api/favorites", () => ({ fetchFavorites, addFavorite, removeFavorite }));
import { clearFavorites, getFavoriteState, loadFavorites, setFavorite } from "../../src/state/favorites";
const wxBoundary = { getStorageSync: vi.fn(), setStorageSync: vi.fn(), removeStorageSync: vi.fn() };
afterEach(() => { clearFavorites(); vi.restoreAllMocks(); });
describe("favorites state", () => {
  it("loads cached ids and refreshes from the server", async () => { Object.assign(globalThis, { wx: wxBoundary }); wxBoundary.getStorageSync.mockReturnValue(JSON.stringify(["cached"])); fetchFavorites.mockResolvedValue({ items: [{ id: "fresh" }], nextCursor: null }); await loadFavorites(); expect(getFavoriteState().ids).toEqual(new Set(["fresh"])); expect(wxBoundary.setStorageSync).toHaveBeenCalled(); });
  it("rolls an optimistic change back on failure", async () => { Object.assign(globalThis, { wx: wxBoundary }); wxBoundary.getStorageSync.mockReturnValue(undefined); addFavorite.mockRejectedValueOnce(new Error("offline")); const pending = setFavorite("dish-1", true); expect(getFavoriteState().ids.has("dish-1")).toBe(true); await expect(pending).rejects.toThrow("offline"); expect(getFavoriteState().ids.has("dish-1")).toBe(false); });
  it("serializes rapid choices so the final intent wins", async () => { Object.assign(globalThis, { wx: wxBoundary }); wxBoundary.getStorageSync.mockReturnValue(undefined); let resolveFirst!: () => void; addFavorite.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; })); removeFavorite.mockResolvedValueOnce(undefined); const first = setFavorite("dish-1", true); const second = setFavorite("dish-1", false); expect(getFavoriteState().ids.has("dish-1")).toBe(false); resolveFirst(); await Promise.all([first, second]); expect(removeFavorite).toHaveBeenCalledWith("dish-1"); expect(getFavoriteState().ids.has("dish-1")).toBe(false); });
});
