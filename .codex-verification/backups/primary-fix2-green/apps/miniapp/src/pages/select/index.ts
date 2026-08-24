import type { PublicDishDto } from "@ordering/contracts";

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
  createSelectLoadCoordinator,
  mergeDishPages,
  normalizeSearch,
  presentDishes,
  presentRefreshFailure,
  runSelectRefresh,
  type SelectFilter,
} from "./model";

const retained = {
  query: "",
  categoryId: null as string | null,
  filter: "all" as SelectFilter,
};
type SelectLoadCoordinator = ReturnType<typeof createSelectLoadCoordinator>;
const coordinators = new WeakMap<object, SelectLoadCoordinator>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function coordinatorFor(page: object): SelectLoadCoordinator {
  const coordinator = coordinators.get(page);
  if (!coordinator) throw new Error("select load coordinator is unavailable");
  return coordinator;
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
    coordinators.set(this, createSelectLoadCoordinator((patch) => this.setData(patch)));
    await this.loadInitial();
  },

  onShow() {
    if (!this.data.loading && !this.data.errorMessage) this.refreshDishViews();
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer);
    coordinators.get(this)?.invalidate();
    coordinators.delete(this);
  },

  async loadInitial() {
    const coordinator = coordinatorFor(this);
    const requestId = coordinator.begin("reset");
    this.setData({ refreshNotice: "" });
    try {
      await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
      const [categoriesResponse, dishesResponse] = await Promise.all([
        fetchCategories(),
        fetchDishes(buildDishQuery({
          query: this.data.query,
          categoryId: this.data.categoryId,
          cursor: null,
        })),
        loadFavorites(),
      ]);
      if (!coordinator.commit(requestId, { loading: false, loadingMore: false })) return;
      this.setData({
        categories: categoriesResponse.items,
        sourceItems: dishesResponse.items,
        nextCursor: dishesResponse.nextCursor,
      });
      this.refreshDishViews();
      if (this.data.filter === "favorites") await this.loadFavoriteItems();
    } catch (error) {
      coordinator.fail(requestId, errorMessage(error));
    }
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

  async loadDishes(reset: boolean, background = false): Promise<boolean> {
    if (!reset && (!this.data.nextCursor || this.data.loadingMore)) return true;
    const coordinator = coordinatorFor(this);
    const requestId = coordinator.begin(background ? "refresh" : reset ? "reset" : "more");
    if (!background) this.setData({ refreshNotice: "" });
    try {
      const response = await fetchDishes(buildDishQuery({
        query: this.data.query,
        categoryId: this.data.categoryId,
        cursor: reset ? null : this.data.nextCursor,
      }));
      if (!coordinator.commit(requestId, { loading: false, loadingMore: false })) return false;
      this.setData({
        sourceItems: reset
          ? response.items
          : mergeDishPages(this.data.sourceItems, response.items),
        nextCursor: response.nextCursor,
      });
      this.refreshDishViews();
      return true;
    } catch (error) {
      coordinator.fail(requestId, errorMessage(error));
      return false;
    }
  },

  async loadFavoriteItems(background = false): Promise<boolean> {
    const coordinator = coordinatorFor(this);
    const requestId = coordinator.begin(background ? "refresh" : "favorites");
    if (!background) this.setData({ refreshNotice: "" });
    try {
      const ids = [...getFavoriteState().ids];
      const batches: string[][] = [];
      for (let index = 0; index < ids.length; index += 100) {
        batches.push(ids.slice(index, index + 100));
      }
      const replies = await Promise.all(batches.map((batch) => fetchDishAvailability(batch)));
      if (!coordinator.commit(requestId, { loading: false, loadingMore: false })) return false;
      const sourceItems = replies.flatMap((reply) => reply.items.flatMap((item) => (
        item.available ? [item.dish] : []
      )));
      this.setData({ sourceItems, nextCursor: null });
      this.refreshDishViews();
      return true;
    } catch (error) {
      coordinator.fail(requestId, errorMessage(error));
      return false;
    }
  },

  handleSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const queryInput = event.detail.value;
    this.setData({ queryInput });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const query = normalizeSearch(queryInput);
      retained.query = query;
      this.setData({ query, queryInput: query, refreshNotice: "" });
      if (this.data.filter === "favorites") this.refreshDishViews();
      else void this.loadDishes(true);
    }, 300);
  },

  handleClearSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    retained.query = "";
    this.setData({ query: "", queryInput: "", refreshNotice: "" });
    if (this.data.filter === "favorites") this.refreshDishViews();
    else void this.loadDishes(true);
  },

  handleCategory(event: WechatMiniprogram.BaseEvent) {
    const categoryId = String(event.currentTarget.dataset.id ?? "") || null;
    if (categoryId === this.data.categoryId) return;
    retained.categoryId = categoryId;
    this.setData({ categoryId, refreshNotice: "" });
    if (this.data.filter === "favorites") this.refreshDishViews();
    else void this.loadDishes(true);
  },

  handleFilter(event: WechatMiniprogram.BaseEvent) {
    const filter = event.currentTarget.dataset.filter === "favorites" ? "favorites" : "all";
    if (filter === this.data.filter) return;
    const coordinator = coordinatorFor(this);
    coordinator.switchMode();
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
    if (this.data.filter === "favorites") void this.loadFavoriteItems();
    else void this.loadInitial();
  },

  handleRefreshRetry() {
    void this.onPullDownRefresh();
  },

  async onPullDownRefresh() {
    const coordinator = coordinatorFor(this);
    const hasItems = this.data.sourceItems.length > 0;
    coordinator.switchMode();
    this.setData({ refreshing: true, refreshNotice: "" });
    const result = await runSelectRefresh({
      loadFavorites,
      loadCategories: async () => (await fetchCategories()).items,
      reloadDishes: async (categories) => {
        this.setData({ categories });
        const loaded = this.data.filter === "favorites"
          ? await this.loadFavoriteItems(true)
          : await this.loadDishes(true, true);
        if (!loaded) throw new Error(this.data.errorMessage || "菜单刷新没有完成，请重试。");
      },
      stop: () => wx.stopPullDownRefresh(),
    });
    if (result.ok) {
      this.setData({ refreshing: false, errorMessage: "", refreshNotice: "" });
      return;
    }
    const failure = presentRefreshFailure(errorMessage(result.error), hasItems);
    this.setData({
      refreshing: false,
      loading: false,
      loadingMore: false,
      errorMessage: failure.blockingError,
      refreshNotice: failure.refreshNotice,
    });
  },

  onReachBottom() {
    if (this.data.filter === "all") void this.loadDishes(false);
  },
});
