import type { SavedListDetailDto, SavedListSummaryDto } from "@ordering/contracts";

import { copyList, deleteList, fetchList, fetchLists } from "../../api/lists";
import { ClientError } from "../../api/request";
import { getDraft, replaceDraft } from "../../state/draft";
import { consumeSavedListDetail } from "../../state/navigation";
import { newIdempotencyKey } from "../../utils/idempotency";
import { formatCents } from "../../utils/price";
import {
  buildEditableDraft,
  createSavedListsPager,
  deleteSavedList,
  formatCopySkippedNotice,
  presentSavedListDetail,
} from "./model";

type Pager = ReturnType<typeof createSavedListsPager>;
type DetailView = ReturnType<typeof presentSavedListDetail> & { updatedText: string };
type ListCard = SavedListSummaryDto & { totalText: string; updatedText: string };

const pagers = new WeakMap<object, Pager>();
const detailCache = new WeakMap<object, SavedListDetailDto>();

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ClientError) {
    return error.requestId ? `${error.message}（请求编号 ${error.requestId}）` : error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "更新时间未知";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function confirmDialog(options: {
  title: string;
  content: string;
  confirmText: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title,
      content: options.content,
      confirmText: options.confirmText,
      ...(options.danger ? { confirmColor: "#9f3f35" } : {}),
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

function showNotice(title: string, content: string): Promise<void> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}

function copiedName(name: string): string {
  const suffix = "（复制）";
  return `${Array.from(name).slice(0, 40 - Array.from(suffix).length).join("")}${suffix}`;
}

Page({
  data: {
    viewMode: "list" as "list" | "detail",
    cards: [] as ListCard[],
    loading: true,
    refreshing: false,
    loadingMore: false,
    listError: "",
    detail: null as DetailView | null,
    detailLoading: false,
    detailError: "",
    actionPending: "" as "" | "edit" | "copy" | "delete",
  },

  onLoad() {
    pagers.set(this, createSavedListsPager({ fetchPage: fetchLists }));
    void this.loadLists(false);
  },

  onShow() {
    const listId = consumeSavedListDetail();
    if (listId) void this.openDetail(listId);
  },

  onUnload() {
    pagers.delete(this);
    detailCache.delete(this);
  },

  syncCards() {
    const pager = pagers.get(this);
    if (!pager) return;
    const state = pager.getState();
    const cards: ListCard[] = state.items.map((item) => ({
      ...item,
      totalText: formatCents(item.totalCents),
      updatedText: formatDate(item.updatedAt),
    }));
    this.setData({ cards, loadingMore: state.loading });
  },

  async loadLists(refresh: boolean) {
    const pager = pagers.get(this);
    if (!pager) return;
    if (refresh) this.setData({ refreshing: true, listError: "" });
    else if (!this.data.cards.length) this.setData({ loading: true, listError: "" });
    else this.setData({ loadingMore: true, listError: "" });
    try {
      await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
      if (refresh) await pager.refresh();
      else await pager.loadMore();
      this.syncCards();
      this.setData({ loading: false, refreshing: false, loadingMore: false, listError: "" });
    } catch (error) {
      this.setData({
        loading: false,
        refreshing: false,
        loadingMore: false,
        listError: messageFor(error, "已保存清单暂时没有加载成功。"),
      });
    }
  },

  async openDetail(listId: string) {
    if (!listId || this.data.detailLoading) return;
    this.setData({
      viewMode: "detail",
      detail: null,
      detailLoading: true,
      detailError: "",
      actionPending: "",
    });
    try {
      await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
      const detail = await fetchList(listId);
      detailCache.set(this, detail);
      this.setData({
        detail: { ...presentSavedListDetail(detail), updatedText: formatDate(detail.updatedAt) },
        detailLoading: false,
        detailError: "",
      });
      wx.setNavigationBarTitle({ title: detail.name });
    } catch (error) {
      this.setData({
        detailLoading: false,
        detailError: messageFor(error, "清单详情暂时没有加载成功。"),
      });
    }
  },

  handleOpenDetail(event: WechatMiniprogram.BaseEvent) {
    const listId = String(event.currentTarget.dataset.id ?? "");
    if (listId) void this.openDetail(listId);
  },

  handleBackToList() {
    detailCache.delete(this);
    this.setData({ viewMode: "list", detail: null, detailError: "", actionPending: "" });
    wx.setNavigationBarTitle({ title: "我的清单" });
  },

  handleRetry() {
    const detail = detailCache.get(this);
    if (this.data.viewMode === "detail") {
      const listId = detail?.id ?? this.data.detail?.id;
      if (listId) void this.openDetail(listId);
      else this.handleBackToList();
      return;
    }
    void this.loadLists(this.data.cards.length > 0);
  },

  async handleContinueEditing() {
    const detail = detailCache.get(this);
    if (!detail || this.data.actionPending) return;
    const current = getDraft();
    const confirmed = await confirmDialog({
      title: "继续编辑这份清单？",
      content: current.items.length
        ? "当前清单会被这份已保存清单替换。"
        : "将把这份已保存清单放入当前清单继续编辑。",
      confirmText: "继续编辑",
      danger: current.items.length > 0,
    });
    if (!confirmed) return;
    this.setData({ actionPending: "edit", detailError: "" });
    try {
      const rebuilt = buildEditableDraft(detail);
      replaceDraft(rebuilt.draft);
      if (rebuilt.skippedItemNames.length) {
        await showNotice("已跳过不可用菜品", rebuilt.skippedItemNames.join("、"));
      }
      this.setData({ actionPending: "" });
      wx.switchTab({ url: "/pages/current-list/index" });
    } catch (error) {
      this.setData({
        actionPending: "",
        detailError: messageFor(error, "这份清单暂时无法继续编辑。"),
      });
    }
  },

  async handleCopy() {
    const detail = detailCache.get(this);
    if (!detail || this.data.actionPending) return;
    this.setData({ actionPending: "copy", detailError: "" });
    try {
      const result = await copyList(detail.id, {
        name: copiedName(detail.name),
        idempotencyKey: newIdempotencyKey(),
      });
      const skipped = formatCopySkippedNotice(result.skippedItemNames);
      if (skipped) {
        const title = result.list.items.length ? "清单已复制" : "没有可复制的菜品";
        await showNotice(title, skipped);
      } else {
        wx.showToast({ title: "清单已复制", icon: "success" });
      }
      detailCache.set(this, result.list);
      this.setData({
        detail: { ...presentSavedListDetail(result.list), updatedText: formatDate(result.list.updatedAt) },
        actionPending: "",
      });
      wx.setNavigationBarTitle({ title: result.list.name });
    } catch (error) {
      this.setData({
        actionPending: "",
        detailError: messageFor(error, "复制没有完成，原清单仍然保留。"),
      });
    }
  },

  async handleDelete() {
    const detail = detailCache.get(this);
    const pager = pagers.get(this);
    if (!detail || !pager || this.data.actionPending) return;
    const confirmed = await confirmDialog({
      title: "删除这份清单？",
      content: `“${detail.name}”删除后无法恢复。`,
      confirmText: "确认删除",
      danger: true,
    });
    if (!confirmed) return;
    this.setData({ actionPending: "delete", detailError: "" });
    try {
      await deleteSavedList({
        listId: detail.id,
        deleteRemote: deleteList,
        removeLocal: (listId) => pager.remove(listId),
      });
      this.syncCards();
      this.setData({ actionPending: "" });
      wx.showToast({ title: "清单已删除", icon: "success" });
      this.handleBackToList();
    } catch (error) {
      this.setData({
        actionPending: "",
        detailError: messageFor(error, "删除没有完成，这份清单仍然保留。"),
      });
    }
  },

  async onPullDownRefresh() {
    try {
      if (this.data.viewMode === "detail" && this.data.detail?.id) {
        await this.openDetail(this.data.detail.id);
      } else {
        await this.loadLists(true);
      }
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onReachBottom() {
    if (this.data.viewMode === "list" && !this.data.loadingMore && !this.data.listError) {
      void this.loadLists(false);
    }
  },
});
