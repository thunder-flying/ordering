import type { PublicCategoryDto, PublicDishDto } from "@ordering/contracts";

import { fetchCategories, fetchDishAvailability, fetchDishes } from "../../api/menu";
import { ClientError } from "../../api/request";
import { addDish, getDraft } from "../../state/draft";
import {
  getFavoriteState,
  isFavorite,
  loadFavorites,
  setFavorite,
} from "../../state/favorites";
import {
  buildDishQuery,
  createSelectOrchestrationController,
  mergeDishPages,
  normalizeSearch,
  presentDishes,
  presentRefreshFailure,
  type SelectFilter,
  type SelectLoadResult,
} from "./model";

const retained = {
  query: "",
  categoryId: null as string | null,
  filter: "all" as SelectFilter,
};
type SelectOrchestrator = ReturnType<typeof createSelectOrchestrationController>;
const orchestrators = new WeakMap<object, SelectOrchestrator>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function orchestratorFor(page: object): SelectOrchestrator {
  const orchestrator = orchestrators.get(page);
  if (!orchestrator) throw new Error("select orchestration controller is unavailable");
  return orchestrator;
}

function errorMessage(error: unknown): string {
  if (error instanceof ClientError) {
    return error.requestId ? `${error.message}（请求编号 ${error.requestId}）` : error.message;
  }
  return error instanceof Error && error.message ? error.message : "菜单暂时没有加载成功。";
}

function matchesFavoriteFilters(
  dish: PublicDishDto,
  query: string,
  categoryId: string | null,
): boolean {
  if (categoryId && dish.categoryId !== categoryId) return false;
  const normalized = normalizeSearch(query).toLocaleLowerCase();
  if (!normalized) return true;
  return `${dish.name} ${dish.description}`.toLocaleLowerCase().includes(normalized);
}

async function fetchAvailableFavorites(): Promise<PublicDishDto[]> {
  const ids = [...getFavoriteState().ids];
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += 100) {
    batches.push(ids.slice(index, index + 100));
  }
  const replies = await Promise.all(batches.map((batch) => fetchDishAvailability(batch)));
  return replies.flatMap((reply) => reply.items.flatMap((item) => (
    item.available ? [item.dish] : []
  )));
}

Page({
  data: {
    categories: [] as Array<{ id: string; name: string }>,
    sourceItems: [] as PublicDishDto[],
    dishes: [] as Array<ReturnType<typeof presentDishes>[number] & { favoritePending: boolean }>,
    queryInput: retained.query,
    query: retained.query,
    categoryId: retained.categoryId,
    filter: retained.filter,
    nextCursor: null as string | null,
    loading: true,
    refreshing: false,
    loadingMore: false,
    errorMessage: "",
    refreshNotice: "",
    emptyTitle: "菜单正在整理",
    emptyDetail: "稍后再来看看，新的味道会陆续写进菜单簿。",
    skeletons: [1, 2, 3],
  },

  async onLoad() {
    orchestrators.set(this, createSelectOrchestrationController({
      onRefreshCancelled: () => this.setData({ refreshing: false }),
    }));
    await this.loadInitial();
  },

  onShow() {
    if (!this.data.loading && !this.data.errorMessage) this.refreshDishViews();
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer);
    orchestrators.get(this)?.invalidate();
    orchestrators.delete(this);
  },

  async loadInitial(): Promise<SelectLoadResult> {
    const orchestrator = orchestratorFor(this);
    const ready = getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
    this.setData({ refreshNotice: "" });
    return orchestrator.runBootstrap({
      loadCategories: async () => {
        await ready;
        return (await fetchCategories()).items;
      },
      commitCategories: (categories) => this.setData({ categories }),
      loadFavorites: async () => {
        await ready;
        await loadFavorites();
      },
      loadInitialDishes: () => this.loadDishes(true, "bootstrap", ready),
      currentFilter: () => this.data.filter,
      reloadFavorites: () => this.loadFavoriteItems("bootstrap"),
      fail: (error) => {
        const failure = presentRefreshFailure(errorMessage(error), this.data.sourceItems.length > 0);
        this.setData({
          loading: false,
          loadingMore: false,
          errorMessage: failure.blockingError,
          refreshNotice: failure.refreshNotice,
        });
      },
    });
  },

  refreshDishViews() {
    const favorites = getFavoriteState();
    const source = this.data.filter === "favorites"
      ? this.data.sourceItems.filter((dish) => matchesFavoriteFilters(
        dish,
        this.data.query,
        this.data.categoryId,
      ))
      : this.data.sourceItems;
    const dishes = presentDishes(source, favorites.ids, this.data.filter).map((dish) => ({
      ...dish,
      favoritePending: favorites.pending.has(dish.id),
    }));

    let emptyTitle = "菜单正在整理";
    let emptyDetail = "稍后再来看看，新的味道会陆续写进菜单簿。";
    if (this.data.filter === "favorites") {
      emptyTitle = this.data.query ? "收藏里没有找到" : "还没有收藏";
      emptyDetail = this.data.query
        ? "换个关键词，或回到全部菜品继续看看。"
        : "遇见喜欢的菜时，点一下收藏就会留在这里。";
    } else if (this.data.query) {
      emptyTitle = "没有找到这道味道";
      emptyDetail = "试试更短的关键词，或清空搜索重新翻看。";
    }
    this.setData({ dishes, emptyTitle, emptyDetail });
  },

  loadDishes(
    reset: boolean,
    owner: "bootstrap" | "refresh" | "user" = "user",
    readiness: Promise<unknown> = Promise.resolve(),
  ): Promise<SelectLoadResult> {
    if (!reset && (!this.data.nextCursor || this.data.loadingMore)) {
      return Promise.resolve({ status: "committed" });
    }
    const orchestrator = orchestratorFor(this);
    const query = buildDishQuery({
      query: this.data.query,
      categoryId: this.data.categoryId,
      cursor: reset ? null : this.data.nextCursor,
    });
    return orchestrator.runDish({
      owner,
      start: () => {
        if (owner === "refresh") {
          this.setData({ loadingMore: false, errorMessage: "" });
        } else if (reset) {
          this.setData({ loading: true, loadingMore: false, errorMessage: "", refreshNotice: "" });
        } else {
          this.setData({ loadingMore: true, errorMessage: "", refreshNotice: "" });
        }
      },
      load: async () => {
        await readiness;
        return fetchDishes(query);
      },
      commit: (response) => {
        this.setData({
          sourceItems: reset
            ? response.items
            : mergeDishPages(this.data.sourceItems, response.items),
          nextCursor: response.nextCursor,
          loading: false,
          loadingMore: false,
          errorMessage: "",
        });
        this.refreshDishViews();
      },
      ...(owner === "refresh" ? {} : {
        fail: (error: unknown) => this.setData({
          loading: false,
          loadingMore: false,
          errorMessage: errorMessage(error),
        }),
      }),
    });
  },

  loadFavoriteItems(owner: "bootstrap" | "refresh" | "user" = "user"): Promise<SelectLoadResult> {
    const orchestrator = orchestratorFor(this);
    return orchestrator.runDish({
      owner,
      start: () => {
        if (owner === "refresh") this.setData({ loadingMore: false, errorMessage: "" });
        else this.setData({ loading: true, loadingMore: false, errorMessage: "", refreshNotice: "" });
      },
      load: fetchAvailableFavorites,
      commit: (sourceItems) => {
        this.setData({
          sourceItems,
          nextCursor: null,
          loading: false,
          loadingMore: false,
          errorMessage: "",
        });
        this.refreshDishViews();
      },
      ...(owner === "refresh" ? {} : {
        fail: (error: unknown) => this.setData({
          loading: false,
          loadingMore: false,
          errorMessage: errorMessage(error),
        }),
      }),
    });
  },

  handleSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const queryInput = event.detail.value;
    this.setData({ queryInput });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const query = normalizeSearch(queryInput);
      retained.query = query;
      this.setData({ query, queryInput: query, refreshNotice: "" });
      if (this.data.filter === "favorites") {
        orchestratorFor(this).cancelRefresh();
        this.refreshDishViews();
      } else void this.loadDishes(true);
    }, 300);
  },

  handleClearSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    retained.query = "";
    this.setData({ query: "", queryInput: "", refreshNotice: "" });
    if (this.data.filter === "favorites") {
      orchestratorFor(this).cancelRefresh();
      this.refreshDishViews();
    } else void this.loadDishes(true);
  },

  handleCategory(event: WechatMiniprogram.BaseEvent) {
    const categoryId = String(event.currentTarget.dataset.id ?? "") || null;
    if (categoryId === this.data.categoryId) return;
    retained.categoryId = categoryId;
    this.setData({ categoryId, refreshNotice: "" });
    if (this.data.filter === "favorites") {
      orchestratorFor(this).cancelRefresh();
      this.refreshDishViews();
    } else void this.loadDishes(true);
  },

  handleFilter(event: WechatMiniprogram.BaseEvent) {
    const filter = event.currentTarget.dataset.filter === "favorites" ? "favorites" : "all";
    if (filter === this.data.filter) return;
    retained.filter = filter;
    this.setData({ filter, refreshNotice: "" });
    if (filter === "favorites") void this.loadFavoriteItems();
    else void this.loadDishes(true);
  },

  async handleFavorite(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const id = event.detail.id;
    const pending = setFavorite(id, !isFavorite(id));
    this.refreshDishViews();
    try {
      await pending;
    } catch {
      wx.showToast({ title: "收藏没有更新，请重试", icon: "none" });
    } finally {
      this.refreshDishViews();
    }
  },

  handleAddDish(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const dish = this.data.sourceItems.find((item) => item.id === event.detail.id);
    if (!dish) return;
    addDish({
      dishId: dish.id,
      name: dish.name,
      imageUrl: dish.imageUrl || null,
      referencePriceCents: dish.referencePriceCents,
    });
    const count = getDraft().items.length;
    wx.showToast({ title: `已加入当前清单 · ${count} 道`, icon: "none" });
  },

  handleOpenDetail(event: WechatMiniprogram.CustomEvent<{ id: string }>) {
    wx.navigateTo({ url: `/pages/dish-detail/index?id=${encodeURIComponent(event.detail.id)}` });
  },

  handleRetry() {
    const orchestrator = orchestratorFor(this);
    if (orchestrator.retrySource() !== null) {
      void orchestrator.retry();
      return;
    }
    if (this.data.filter === "favorites") void this.loadFavoriteItems();
    else void this.loadDishes(true);
  },

  handleRefreshRetry() {
    void this.onPullDownRefresh();
  },

  async onPullDownRefresh() {
    const orchestrator = orchestratorFor(this);
    const hasItems = this.data.sourceItems.length > 0;
    const refreshFilter = this.data.filter;
    const query = buildDishQuery({
      query: this.data.query,
      categoryId: this.data.categoryId,
      cursor: null,
    });
    await orchestrator.runRefresh({
      start: () => this.setData({ refreshing: true, refreshNotice: "" }),
      run: () => orchestrator.runDish({
        owner: "refresh",
        start: () => this.setData({ loadingMore: false, errorMessage: "" }),
        load: async () => {
          const [categories] = await Promise.all([
            fetchCategories(),
            loadFavorites(),
          ]);
          if (refreshFilter === "favorites") {
            return {
              categories: categories.items,
              sourceItems: await fetchAvailableFavorites(),
              nextCursor: null,
            };
          }
          const response = await fetchDishes(query);
          return {
            categories: categories.items,
            sourceItems: response.items,
            nextCursor: response.nextCursor,
          };
        },
        commit: (snapshot: {
          categories: PublicCategoryDto[];
          sourceItems: PublicDishDto[];
          nextCursor: string | null;
        }) => {
          this.setData({
            categories: snapshot.categories,
            sourceItems: snapshot.sourceItems,
            nextCursor: snapshot.nextCursor,
            loading: false,
            loadingMore: false,
            errorMessage: "",
          });
          this.refreshDishViews();
        },
      }),
      succeed: () => this.setData({ refreshing: false, errorMessage: "", refreshNotice: "" }),
      fail: (error) => {
        const failure = presentRefreshFailure(errorMessage(error), hasItems);
        this.setData({
          refreshing: false,
          loading: false,
          loadingMore: false,
          errorMessage: failure.blockingError,
          refreshNotice: failure.refreshNotice,
        });
      },
      stop: () => wx.stopPullDownRefresh(),
    });
  },

  onReachBottom() {
    if (this.data.filter === "all") void this.loadDishes(false);
  },
});
