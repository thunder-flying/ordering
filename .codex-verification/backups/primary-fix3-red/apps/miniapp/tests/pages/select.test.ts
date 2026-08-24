import type { PublicDishDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import {
  buildDishQuery,
  createLatestRequestGuard,
  createSelectLoadCoordinator,
  createSelectOrchestrationController,
  mergeDishPages,
  normalizeSearch,
  presentDishes,
  presentRefreshFailure,
  runSelectRefresh,
  type SelectLoadResult,
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

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

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
      loadCategories: async () => { steps.push("categories"); return [{ id: "cat-1", name: "热菜", sortOrder: 0 }]; },
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

  it("commits bootstrap categories even when a faster search makes only the bootstrap dish query stale", async () => {
    const slowInitial = deferred<PublicDishDto[]>();
    const state = { categories: [] as string[], dishes: [] as string[] };
    const controller = createSelectOrchestrationController({ onRefreshCancelled: () => undefined });

    const bootstrap = controller.runBootstrap({
      loadCategories: async () => [{ id: "cat-hot", name: "热菜", sortOrder: 0 }],
      commitCategories: (categories) => { state.categories = categories.map((item) => item.id); },
      loadFavorites: async () => undefined,
      loadInitialDishes: () => controller.runDish({
        owner: "bootstrap",
        load: () => slowInitial.promise,
        commit: (items) => { state.dishes = items.map((item) => item.id); },
      }),
      currentFilter: () => "all",
      reloadFavorites: async () => ({ status: "committed" }),
      fail: () => undefined,
    });

    await controller.runDish({
      owner: "user",
      load: async () => [dishes[1]!],
      commit: (items) => { state.dishes = items.map((item) => item.id); },
    });
    slowInitial.resolve([dishes[0]!]);
    await bootstrap;

    expect(state.categories).toEqual(["cat-hot"]);
    expect(state.dishes).toEqual(["dish-2"]);
  });

  it("reloads the favorite view from latest favorite ids when bootstrap finishes in favorites mode", async () => {
    const finishFavorites = deferred<void>();
    let filter: "all" | "favorites" = "all";
    let latestFavoriteIds = new Set<string>();
    const reloadedIds: string[][] = [];
    const controller = createSelectOrchestrationController({ onRefreshCancelled: () => undefined });

    const bootstrap = controller.runBootstrap({
      loadCategories: async () => [{ id: "cat-hot", name: "热菜", sortOrder: 0 }],
      commitCategories: () => undefined,
      loadFavorites: async () => {
        await finishFavorites.promise;
        latestFavoriteIds = new Set(["dish-2"]);
      },
      loadInitialDishes: async () => ({ status: "committed" }),
      currentFilter: () => filter,
      reloadFavorites: async () => {
        reloadedIds.push([...latestFavoriteIds]);
        return { status: "committed" };
      },
      fail: () => undefined,
    });

    filter = "favorites";
    finishFavorites.resolve();
    await bootstrap;

    expect(reloadedIds).toEqual([["dish-2"]]);
  });

  it("treats a refresh dish load cancelled by a new search as stale without writing an error", async () => {
    const oldRefresh = deferred<PublicDishDto[]>();
    const newSearch = deferred<PublicDishDto[]>();
    const state = { refreshing: false, loading: false, errorMessage: "", refreshNotice: "", dishes: [] as string[] };
    const controller = createSelectOrchestrationController({
      onRefreshCancelled: () => { state.refreshing = false; },
    });

    const refreshing = controller.runRefresh({
      start: () => { state.refreshing = true; },
      run: () => controller.runDish({
        owner: "refresh",
        load: () => oldRefresh.promise,
        commit: (items) => { state.dishes = items.map((item) => item.id); },
      }),
      succeed: () => { state.refreshing = false; state.errorMessage = ""; state.refreshNotice = ""; },
      fail: () => { state.refreshing = false; state.errorMessage = "刷新失败"; },
      stop: () => undefined,
    });

    const searching = controller.runDish({
      owner: "user",
      start: () => { state.loading = true; },
      load: () => newSearch.promise,
      commit: (items) => { state.loading = false; state.dishes = items.map((item) => item.id); },
    });
    oldRefresh.resolve([dishes[0]!]);
    await refreshing;

    expect(state).toMatchObject({ refreshing: false, loading: true, errorMessage: "", refreshNotice: "", dishes: [] });
    newSearch.resolve([dishes[1]!]);
    await searching;
    expect(state.dishes).toEqual(["dish-2"]);
  });

  it("retries a blocking favorites bootstrap through favorites and categories again", async () => {
    let favoriteCalls = 0;
    let categoryCalls = 0;
    let failures = 0;
    let favoriteReloads = 0;
    const controller = createSelectOrchestrationController({ onRefreshCancelled: () => undefined });
    const operations = {
      loadCategories: async () => {
        categoryCalls += 1;
        return [{ id: "cat-hot", name: "热菜", sortOrder: 0 }];
      },
      commitCategories: () => undefined,
      loadFavorites: async () => {
        favoriteCalls += 1;
        if (favoriteCalls === 1) throw new Error("favorites offline");
      },
      loadInitialDishes: async (): Promise<SelectLoadResult> => ({ status: "committed" }),
      currentFilter: () => "favorites" as const,
      reloadFavorites: async (): Promise<SelectLoadResult> => {
        favoriteReloads += 1;
        return { status: "committed" };
      },
      fail: () => { failures += 1; },
    };

    await controller.runBootstrap(operations);
    expect(controller.retrySource()).toBe("bootstrap");
    await controller.retry();

    expect(favoriteCalls).toBe(2);
    expect(categoryCalls).toBe(2);
    expect(failures).toBe(1);
    expect(favoriteReloads).toBe(1);
  });
});
