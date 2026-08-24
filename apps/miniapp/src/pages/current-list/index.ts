import { createList, fetchList, updateList } from "../../api/lists";
import { fetchDishAvailability } from "../../api/menu";
import { ClientError } from "../../api/request";
import {
  clearDraft,
  getDraft,
  removeDish,
  replaceDraft,
  setName,
  setNote,
  setQuantity,
} from "../../state/draft";
import { requestSavedListDetail } from "../../state/navigation";
import { formatCents, multiplyCents, sumCents } from "../../utils/price";
import { buildEditableDraft } from "../../utils/saved-list";
import {
  createCurrentListSaveController,
  mergeDraftAvailability,
  type AvailableDraftItem,
} from "./model";

type SaveController = ReturnType<typeof createCurrentListSaveController>;
type DraftViewItem = AvailableDraftItem & {
  priceText: string;
  subtotalText: string;
  noteLength: number;
};

const controllers = new WeakMap<object, SaveController>();
const availabilityCache = new WeakMap<object, Awaited<ReturnType<typeof fetchDishAvailability>>["items"]>();
const availabilityRequests = new WeakMap<object, number>();
const pageVisibility = new WeakMap<object, boolean>();

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ClientError) return error.requestId ? `${error.message}（请求编号 ${error.requestId}）` : error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

function confirmDialog(options: { title: string; content: string; confirmText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title,
      content: options.content,
      ...(options.confirmText ? { confirmText: options.confirmText } : {}),
      ...(options.danger ? { confirmColor: "#9f3f35" } : {}),
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

function characterLength(value: string): number { return Array.from(value).length; }

Page({
  data: {
    name: "",
    items: [] as DraftViewItem[],
    totalText: "¥0.00",
    unavailableNames: [] as string[],
    availabilityReady: false,
    availabilityLoading: false,
    availabilityError: "",
    saving: false,
    saveError: "",
    conflict: false,
    canSave: false,
    editMode: false,
  },

  onLoad() {
    pageVisibility.set(this, true);
    let checkedAvailability: Awaited<ReturnType<typeof fetchDishAvailability>>["items"] = [];
    controllers.set(this, createCurrentListSaveController({
      getDraft,
      fetchAvailability: async (ids) => {
        const response = await fetchDishAvailability(ids);
        checkedAvailability = response.items;
        return response;
      },
      applyAvailability: (result) => {
        availabilityCache.set(this, checkedAvailability);
        this.setData({ availabilityReady: true, availabilityLoading: false, availabilityError: "", unavailableNames: result.unavailableNames });
        this.refreshPresentation();
      },
      create: createList,
      update: updateList,
      clearDraft,
    }));
  },

  onShow() {
    pageVisibility.set(this, true);
    void this.refreshAvailability();
  },

  onHide() { pageVisibility.set(this, false); },

  onUnload() {
    controllers.delete(this);
    availabilityCache.delete(this);
    availabilityRequests.delete(this);
    pageVisibility.delete(this);
  },

  refreshPresentation() {
    const draft = getDraft();
    const cached = availabilityCache.get(this);
    const merged = cached
      ? mergeDraftAvailability(draft.items, cached)
      : { items: draft.items.map((item) => ({ ...item, available: true })), unavailableNames: [] as string[] };
    const items: DraftViewItem[] = merged.items.map((item) => ({
      ...item,
      priceText: formatCents(item.referencePriceCents),
      subtotalText: formatCents(multiplyCents(item.referencePriceCents, item.quantity)),
      noteLength: characterLength(item.note),
    }));
    const totalCents = sumCents(items.map((item) => multiplyCents(item.referencePriceCents, item.quantity)));
    const validName = characterLength(draft.name.trim()) >= 1 && characterLength(draft.name.trim()) <= 40;
    const canSave = this.data.availabilityReady && validName && items.length > 0 && merged.unavailableNames.length === 0 && !this.data.saving;
    this.setData({
      name: draft.name,
      items,
      totalText: formatCents(totalCents),
      unavailableNames: merged.unavailableNames,
      editMode: draft.editTarget !== null,
      canSave,
    });
  },

  async refreshAvailability() {
    const requestId = (availabilityRequests.get(this) ?? 0) + 1;
    availabilityRequests.set(this, requestId);
    availabilityCache.delete(this);
    const draft = getDraft();
    if (!draft.items.length) {
      this.setData({ availabilityReady: true, availabilityLoading: false, availabilityError: "", saveError: "", conflict: false });
      this.refreshPresentation();
      return;
    }
    this.setData({ availabilityReady: false, availabilityLoading: true, availabilityError: "", saveError: "", conflict: false });
    this.refreshPresentation();
    try {
      await getApp<{ globalData: { ready: Promise<unknown> } }>().globalData.ready;
      const response = await fetchDishAvailability(draft.items.map((item) => item.dishId));
      if (availabilityRequests.get(this) !== requestId) return;
      availabilityCache.set(this, response.items);
      this.setData({ availabilityReady: true, availabilityLoading: false });
      this.refreshPresentation();
    } catch (error) {
      if (availabilityRequests.get(this) !== requestId) return;
      this.setData({ availabilityReady: false, availabilityLoading: false, availabilityError: messageFor(error, "暂时无法确认菜品是否可选，请重新检查。") });
      this.refreshPresentation();
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    setName(event.detail.value);
    this.setData({ saveError: "", conflict: false });
    this.refreshPresentation();
  },

  handleQuantity(event: WechatMiniprogram.CustomEvent<{ quantity: number }>) {
    const dishId = String(event.currentTarget.dataset.id ?? "");
    if (!dishId || !Number.isInteger(event.detail.quantity)) return;
    setQuantity(dishId, event.detail.quantity);
    this.setData({ saveError: "", conflict: false });
    this.refreshPresentation();
  },

  handleNoteInput(event: WechatMiniprogram.Input) {
    const dishId = String(event.currentTarget.dataset.id ?? "");
    if (!dishId) return;
    setNote(dishId, event.detail.value);
    this.setData({ saveError: "", conflict: false });
    this.refreshPresentation();
  },

  async handleRemove(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return;
    const dishId = String(event.currentTarget.dataset.id ?? "");
    const item = this.data.items.find((entry) => entry.dishId === dishId);
    if (!item) return;
    const confirmed = await confirmDialog({ title: "移出当前清单？", content: `将“${item.name}”移出当前清单，其他菜品会保留。`, confirmText: "确认移出", danger: true });
    if (!confirmed) return;
    removeDish(dishId);
    this.setData({ saveError: "", conflict: false });
    this.refreshPresentation();
  },

  handleBackToSelect() { wx.switchTab({ url: "/pages/select/index" }); },

  async handleSave() {
    const controller = controllers.get(this);
    if (!controller || controller.isPending() || !this.data.canSave) return;
    this.setData({ saving: true, saveError: "", conflict: false, canSave: false });
    const result = await controller.save();
    if (result.status === "saved") {
      this.setData({ saving: false });
      if (!pageVisibility.get(this)) return;
      requestSavedListDetail(result.list.id);
      wx.showToast({ title: "清单已保存", icon: "success" });
      wx.switchTab({ url: "/pages/my-lists/index" });
      return;
    }
    if (result.status === "saved-stale") {
      this.setData({ saving: false });
      if (!pageVisibility.get(this)) return;
      await this.refreshAvailability();
      this.setData({ saveError: "原清单已保存；保存期间当前清单发生变化，新内容仍保留，请确认后再次保存。" });
      return;
    }
    if (result.status === "unavailable") {
      this.setData({ saving: false, unavailableNames: result.unavailableNames, saveError: "请先移出暂不可选的菜品，再保存清单。" });
      this.refreshPresentation();
      this.setData({ unavailableNames: result.unavailableNames });
      return;
    }
    if (result.status === "stale") {
      this.setData({ saving: false, saveError: "当前清单已发生变化，请重新确认后保存。" });
      await this.refreshAvailability();
      return;
    }
    if (result.status === "conflict") {
      this.setData({ saving: false, conflict: true, saveError: messageFor(result.error, "这份清单已经更新，请重新载入后再编辑。") });
    } else {
      this.setData({ saving: false, saveError: messageFor(result.error, "保存没有完成，当前清单已完整保留。") });
    }
    this.refreshPresentation();
  },

  async handleReloadConflict() {
    const target = getDraft().editTarget;
    if (!target || this.data.saving) return;
    const confirmed = await confirmDialog({
      title: "重新载入已保存清单？",
      content: "当前填写内容会被已保存清单替换。此操作不会自动合并两边的修改。",
      confirmText: "重新载入",
      danger: true,
    });
    if (!confirmed) return;
    this.setData({ saving: true, saveError: "", conflict: false });
    try {
      const detail = await fetchList(target.listId);
      const rebuilt = buildEditableDraft(detail);
      replaceDraft(rebuilt.draft);
      if (rebuilt.skippedItemNames.length) {
        await new Promise<void>((resolve) => {
          wx.showModal({
            title: "已跳过不可用菜品",
            content: rebuilt.skippedItemNames.join("、"),
            showCancel: false,
            success: () => resolve(),
            fail: () => resolve(),
          });
        });
      }
      availabilityCache.delete(this);
      await this.refreshAvailability();
    } catch (error) {
      this.setData({ saving: false, conflict: true, saveError: messageFor(error, "重新载入没有完成，当前填写内容仍然保留。") });
    } finally {
      this.setData({ saving: false });
      this.refreshPresentation();
    }
  },
});
