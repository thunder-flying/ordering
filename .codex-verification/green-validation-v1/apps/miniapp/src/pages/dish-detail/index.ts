import { fetchDishAvailability } from "../../api/menu";
import { ClientError } from "../../api/request";
import { addDish, getDraft } from "../../state/draft";
import {
  isFavorite,
  loadFavorites,
  setFavorite,
} from "../../state/favorites";
import {
  createDishDetailLoader,
  presentDishDetail,
  type DishDetailView,
} from "./model";

type DishDetailLoader = ReturnType<typeof createDishDetailLoader>;
const loaders = new WeakMap<object, DishDetailLoader>();

function errorMessage(error: unknown): string {
  if (error instanceof ClientError) {
    return error.requestId ? `${error.message}（请求编号 ${error.requestId}）` : error.message;
  }
  return error instanceof Error && error.message ? error.message : "菜品详情暂时没有加载成功。";
}

function decodeDishId(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return "";
  }
}

Page({
  data: {
    dishId: "",
    status: "loading" as "loading" | "ready" | "unavailable" | "error",
    dish: null as DishDetailView | null,
    favoritePending: false,
    imageFailed: false,
    errorMessage: "",
  },

  async onLoad(options: Record<string, string | undefined>) {
    const dishId = decodeDishId(options.id);
    if (!dishId) {
      this.setData({
        status: "error",
        dish: null,
        errorMessage: "没有找到要查看的菜品编号。",
        imageFailed: false,
      });
      return;
    }
    this.setData({ dishId });
    loaders.set(this, createDishDetailLoader({
      load: async (requestedDishId) => {
        await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
        const [response] = await Promise.all([
          fetchDishAvailability([requestedDishId]),
          loadFavorites(),
        ]);
        const favoriteIds = isFavorite(requestedDishId)
          ? new Set([requestedDishId])
          : new Set<string>();
        return presentDishDetail(requestedDishId, response.items, favoriteIds);
      },
      apply: (state) => {
        this.setData(state);
        if (state.status === "ready" && state.dish) {
          wx.setNavigationBarTitle({ title: state.dish.name });
        }
      },
      formatError: errorMessage,
    }));
    await this.loadDetail();
  },

  onShow() {
    if (this.data.status === "ready") this.refreshFavoritePresentation();
  },

  onUnload() {
    loaders.get(this)?.invalidate();
    loaders.delete(this);
  },

  async loadDetail() {
    const loader = loaders.get(this);
    if (!loader || !this.data.dishId) return;
    await loader.load(this.data.dishId);
  },

  refreshFavoritePresentation() {
    const dish = this.data.dish;
    if (!dish) return;
    this.setData({ dish: { ...dish, favorited: isFavorite(dish.id) } });
  },

  async handleFavorite() {
    const dish = this.data.dish;
    if (!dish || this.data.favoritePending) return;
    const pending = setFavorite(dish.id, !isFavorite(dish.id));
    this.setData({ favoritePending: true });
    this.refreshFavoritePresentation();
    try {
      await pending;
    } catch {
      wx.showToast({ title: "收藏没有更新，请重试", icon: "none" });
    } finally {
      this.setData({ favoritePending: false });
      this.refreshFavoritePresentation();
    }
  },

  handleAddDish() {
    const dish = this.data.dish;
    if (!dish) return;
    addDish({
      dishId: dish.id,
      name: dish.name,
      imageUrl: dish.imageUrl || null,
      referencePriceCents: dish.referencePriceCents,
    });
    wx.showToast({
      title: `已加入当前清单 · ${getDraft().items.length} 道`,
      icon: "none",
    });
  },

  handleImageError() {
    this.setData({ imageFailed: true });
  },

  async onPullDownRefresh() {
    try {
      await this.loadDetail();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
