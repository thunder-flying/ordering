import type { SavedListDetailDto, SavedListSummaryDto } from "@ordering/contracts";

import { multiplyCents, formatCents } from "../../utils/price";
import { buildEditableDraft } from "../../utils/saved-list";

export { buildEditableDraft } from "../../utils/saved-list";

export type SavedListsPage = {
  items: SavedListSummaryDto[];
  nextCursor: string | null;
};

export type SavedListsPagerState = {
  items: SavedListSummaryDto[];
  nextCursor: string | null;
  loading: boolean;
};

function sortNewest(items: SavedListSummaryDto[]): SavedListSummaryDto[] {
  return [...items].sort((left, right) => {
    const difference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return difference || left.id.localeCompare(right.id);
  });
}

function mergeUnique(
  current: readonly SavedListSummaryDto[],
  incoming: readonly SavedListSummaryDto[],
): SavedListSummaryDto[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return sortNewest([...byId.values()]);
}

export function createSavedListsPager(dependencies: {
  fetchPage(query: { cursor?: string; limit: number }): Promise<SavedListsPage>;
}): {
  loadMore(): Promise<void>;
  refresh(): Promise<void>;
  remove(listId: string): void;
  getState(): SavedListsPagerState;
} {
  let state: SavedListsPagerState = { items: [], nextCursor: null, loading: false };
  let initialized = false;
  let requestId = 0;
  let loadMorePending: Promise<void> | null = null;
  let refreshPending: Promise<void> | null = null;

  async function request(reset: boolean): Promise<void> {
    if (!reset && initialized && state.nextCursor === null) return;
    const id = ++requestId;
    const cursor = reset ? null : state.nextCursor;
    state = { ...state, loading: true };
    try {
      const response = await dependencies.fetchPage(cursor
        ? { cursor, limit: 20 }
        : { limit: 20 });
      if (id !== requestId) return;
      state = {
        items: reset ? sortNewest(response.items) : mergeUnique(state.items, response.items),
        nextCursor: response.nextCursor,
        loading: false,
      };
      initialized = true;
    } catch (error) {
      if (id === requestId) state = { ...state, loading: false };
      throw error;
    }
  }

  return {
    loadMore() {
      loadMorePending ??= request(false).finally(() => { loadMorePending = null; });
      return loadMorePending;
    },
    refresh() {
      refreshPending ??= request(true).finally(() => { refreshPending = null; });
      return refreshPending;
    },
    remove(listId) {
      state = { ...state, items: state.items.filter((item) => item.id !== listId) };
    },
    getState() {
      return { ...state, items: state.items.map((item) => ({ ...item })) };
    },
  };
}

export function presentSavedListDetail(detail: SavedListDetailDto): {
  id: string;
  name: string;
  itemCount: number;
  totalText: string;
  updatedAt: string;
  items: Array<{
    dishId: string | null;
    name: string;
    referencePriceText: string;
    quantity: number;
    note: string;
    subtotalText: string;
    currentlyAvailable: boolean;
  }>;
} {
  return {
    id: detail.id,
    name: detail.name,
    itemCount: detail.itemCount,
    totalText: formatCents(detail.totalCents),
    updatedAt: detail.updatedAt,
    items: [...detail.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        dishId: item.dishId,
        name: item.nameSnapshot,
        referencePriceText: formatCents(item.referencePriceCentsSnapshot),
        quantity: item.quantity,
        note: item.note,
        subtotalText: formatCents(multiplyCents(item.referencePriceCentsSnapshot, item.quantity)),
        currentlyAvailable: item.currentlyAvailable,
      })),
  };
}

export function formatCopySkippedNotice(skippedItemNames: readonly string[]): string {
  return skippedItemNames.length
    ? `已跳过不可用菜品：${skippedItemNames.join("、")}`
    : "";
}

export async function deleteSavedList(dependencies: {
  listId: string;
  deleteRemote(listId: string): Promise<unknown>;
  removeLocal(listId: string): void;
}): Promise<void> {
  await dependencies.deleteRemote(dependencies.listId);
  dependencies.removeLocal(dependencies.listId);
}

void buildEditableDraft;
