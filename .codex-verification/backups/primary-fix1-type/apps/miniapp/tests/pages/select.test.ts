import type { PublicDishDto } from "@ordering/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  buildDishQuery,
  createLatestRequestGuard,
  createSelectLoadCoordinator,
  mergeDishPages,
  normalizeSearch,
  presentDishes,
  presentRefreshFailure,
  runSelectRefresh,
} from "../../src/pages/select/model";

const dishes: PublicDishDto[] = [
  {
    id: "dish-1",
    categoryId: "cat-hot",
    name: "番茄牛腩",
    description: "慢炖至软嫩",
    imageUrl: "https://example.test/beef.jpg",
    referencePriceCents: 2_680,
    sortOrder: 1,
  },
  {
    id: "dish-2",
    categoryId: "cat-cold",
    name: "桂花藕",
    description: "清甜软糯",
    imageUrl: "",
    referencePriceCents: 880,
    sortOrder: 2,
  },
];

describe("select page model", () => {
  it("trims search text and builds a 20-item first-page query", () => {
    expect(normalizeSearch("  牛腩  ")).toBe("牛腩");
    expect(buildDishQuery({ query: "  牛腩  ", categoryId: "cat-hot", cursor: null })).toEqual({
      q: "牛腩",
      categoryId: "cat-hot",
      limit: 20,
    });
  });

  it("omits empty search, category, and cursor values from a page query", () => {
    expect(buildDishQuery({ query: "   ", categoryId: null, cursor: null })).toEqual({ limit: 20 });
    expect(buildDishQuery({ query: "藕", categoryId: null, cursor: "next-page" })).toEqual({
      q: "藕",
      cursor: "next-page",
      limit: 20,
    });
  });

  it("accepts only the latest request after searches race", () => {
    const requests = createLatestRequestGuard();
    const first = requests.begin();
    const second = requests.begin();
    expect(requests.isLatest(first)).toBe(false);
    expect(requests.isLatest(second)).toBe(true);
  });

  it("appends cursor pages without duplicating dishes", () => {
    expect(mergeDishPages([dishes[0]!], [dishes[0]!, dishes[1]!])).toEqual(dishes);
  });

  it("maps integer prices and favorite state for all and favorite-only views", () => {
    const favoriteIds = new Set(["dish-2"]);
    expect(presentDishes(dishes, favoriteIds, "all")).toEqual([
      expect.objectContaining({ id: "dish-1", priceText: "¥26.80", favorited: false }),
      expect.objectContaining({ id: "dish-2", priceText: "¥8.80", favorited: true }),
    ]);
    expect(presentDishes(dishes, favoriteIds, "favorites")).toEqual([
      expect.objectContaining({ id: "dish-2", priceText: "¥8.80", favorited: true }),
    ]);
  });

  it("clears load-more immediately when switching to favorites and ignores stale pagination completion", () => {
    const state = { loading: false, loadingMore: false, errorMessage: "" };
    const coordinator = createSelectLoadCoordinator((patch) => Object.assign(state, patch));

    const oldPage = coordinator.begin("more");
    expect(state.loadingMore).toBe(true);
    coordinator.switchMode();
    const favoriteLoad = coordinator.begin("favorites");

    expect(state).toMatchObject({ loading: true, loadingMore: false, errorMessage: "" });
    expect(coordinator.commit(oldPage, { loadingMore: true, errorMessage: "stale" })).toBe(false);
    expect(state).toMatchObject({ loading: true, loadingMore: false, errorMessage: "" });

    expect(coordinator.commit(favoriteLoad, { loading: false, loadingMore: false })).toBe(true);
    expect(state.loadingMore).toBe(false);
  });

  it("clears load-more on favorite-load failure", () => {
    const state = { loading: false, loadingMore: true, errorMessage: "" };
    const coordinator = createSelectLoadCoordinator((patch) => Object.assign(state, patch));
    const requestId = coordinator.begin("favorites");
    coordinator.fail(requestId, "网络较慢，请重试");
    expect(state).toEqual({ loading: false, loadingMore: false, errorMessage: "网络较慢，请重试" });
  });

  it("stops refresh and does not reload dishes when favorite/category refresh fails", async () => {
    const steps: string[] = [];
    const failure = new Error("offline");
    const result = await runSelectRefresh({
      loadFavorites: async () => { steps.push("favorites"); throw failure; },
      loadCategories: async () => { steps.push("categories"); return [{ id: "cat-1", name: "热菜" }]; },
      reloadDishes: async () => { steps.push("dishes"); },
      stop: () => { steps.push("stop"); },
    });

    expect(result).toEqual({ ok: false, error: failure });
    expect(steps).toContain("favorites");
    expect(steps).toContain("categories");
    expect(steps).not.toContain("dishes");
    expect(steps.at(-1)).toBe("stop");
  });

  it("keeps existing dishes visible for a recoverable refresh failure", () => {
    expect(presentRefreshFailure("网络较慢，请重试", true)).toEqual({
      blockingError: "",
      refreshNotice: "网络较慢，请重试",
    });
    expect(presentRefreshFailure("网络较慢，请重试", false)).toEqual({
      blockingError: "网络较慢，请重试",
      refreshNotice: "",
    });
  });
});
