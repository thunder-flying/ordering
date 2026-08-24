import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchFavorites, addFavorite, removeFavorite } = vi.hoisted(() => ({
  fetchFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));
vi.mock("../../src/api/favorites", () => ({ fetchFavorites, addFavorite, removeFavorite }));

import * as favoritesState from "../../src/state/favorites";

const {
  clearFavorites,
  getFavoriteState,
  isFavorite,
  loadFavorites,
  setFavorite,
} = favoritesState;

const wxBoundary = {
  getStorageSync: vi.fn(),
  setStorageSync: vi.fn(),
  removeStorageSync: vi.fn(),
};

function installWx(stored?: unknown): void {
  Object.assign(globalThis, { wx: wxBoundary });
  wxBoundary.getStorageSync.mockReturnValue(stored);
}

function requireSettle(): () => Promise<void> {
  const settle = (favoritesState as Record<string, unknown>).settleFavoriteMutations;
  expect(settle, "settleFavoriteMutations must be exported for destructive flows").toBeTypeOf("function");
  return settle as () => Promise<void>;
}

afterEach(() => {
  clearFavorites();
  vi.restoreAllMocks();
});

describe("favorites state", () => {
  it("loads cached ids and refreshes from the server", async () => {
    installWx(JSON.stringify(["cached"]));
    fetchFavorites.mockResolvedValue({ items: [{ id: "fresh" }], nextCursor: null });
    await loadFavorites();
    expect(getFavoriteState().ids).toEqual(new Set(["fresh"]));
    expect(wxBoundary.setStorageSync).toHaveBeenCalled();
  });

  it("loads every cursor page into the real favorite state", async () => {
    installWx();
    fetchFavorites
      .mockResolvedValueOnce({ items: [{ id: "first" }], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [{ id: "second" }], nextCursor: null });
    await loadFavorites();
    expect(getFavoriteState().ids).toEqual(new Set(["first", "second"]));
    expect(getFavoriteState().loaded).toBe(true);
    expect(fetchFavorites).toHaveBeenNthCalledWith(1, { limit: 50 });
    expect(fetchFavorites).toHaveBeenNthCalledWith(2, { cursor: "page-2", limit: 50 });
  });

  it("rolls an optimistic change back on failure", async () => {
    installWx();
    addFavorite.mockRejectedValueOnce(new Error("offline"));
    const pending = setFavorite("dish-1", true);
    expect(getFavoriteState().ids.has("dish-1")).toBe(true);
    await expect(pending).rejects.toThrow("offline");
    expect(getFavoriteState().ids.has("dish-1")).toBe(false);
  });

  it("serializes rapid choices so the final intent wins", async () => {
    installWx();
    let resolveFirst!: () => void;
    addFavorite.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    removeFavorite.mockResolvedValueOnce(undefined);
    const first = setFavorite("dish-1", true);
    const second = setFavorite("dish-1", false);
    expect(getFavoriteState().ids.has("dish-1")).toBe(false);
    resolveFirst();
    await Promise.all([first, second]);
    expect(removeFavorite).toHaveBeenCalledWith("dish-1");
    expect(getFavoriteState().ids.has("dish-1")).toBe(false);
  });

  it("does not let an older full load overwrite a successful mutation", async () => {
    installWx();
    let resolveLoad!: (value: { items: Array<{ id: string }>; nextCursor: null }) => void;
    fetchFavorites.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    addFavorite.mockResolvedValueOnce(undefined);

    const loading = loadFavorites();
    await Promise.resolve();
    await setFavorite("dish-1", true);
    resolveLoad({ items: [], nextCursor: null });
    await loading;

    expect(isFavorite("dish-1")).toBe(true);
    expect(getFavoriteState().ids).toEqual(new Set(["dish-1"]));
  });

  it("does not let an in-flight favorite write repopulate state or cache after clear", async () => {
    installWx();
    let resolveAdd!: () => void;
    addFavorite.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveAdd = resolve; }));

    const pending = setFavorite("dish-1", true);
    expect(getFavoriteState().ids).toEqual(new Set(["dish-1"]));
    clearFavorites();
    wxBoundary.setStorageSync.mockClear();

    resolveAdd();
    await pending;

    expect(getFavoriteState().ids).toEqual(new Set());
    expect(getFavoriteState().pending).toEqual(new Set());
    expect(wxBoundary.setStorageSync).not.toHaveBeenCalled();
  });

  it("waits for every in-flight favorite mutation before settling", async () => {
    installWx();
    const settleFavoriteMutations = requireSettle();
    const calls: string[] = [];
    let resolveAdd!: () => void;
    addFavorite.mockImplementationOnce(() => new Promise<void>((resolve) => {
      calls.push("remote:start");
      resolveAdd = () => { calls.push("remote:done"); resolve(); };
    }));

    const mutation = setFavorite("dish-1", true);
    const settling = settleFavoriteMutations().then(() => { calls.push("settled"); });
    await Promise.resolve();
    expect(calls).toEqual(["remote:start"]);

    resolveAdd();
    await Promise.all([mutation, settling]);
    expect(calls).toEqual(["remote:start", "remote:done", "settled"]);
  });

  it("settles after a failed favorite mutation without rethrowing it into destructive flows", async () => {
    installWx();
    const settleFavoriteMutations = requireSettle();
    const failure = new Error("favorite offline");
    let rejectAdd!: (error: unknown) => void;
    addFavorite.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectAdd = reject; }));

    const mutation = setFavorite("dish-1", true).catch(() => undefined);
    const settling = settleFavoriteMutations();
    rejectAdd(failure);

    await expect(settling).resolves.toBeUndefined();
    await mutation;
    expect(getFavoriteState().pending).toEqual(new Set());
  });
});
