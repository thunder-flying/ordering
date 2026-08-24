import type { CopyListResultDto, SavedListDetailDto, SavedListSummaryDto } from "@ordering/contracts";

import { ClientError } from "../../api/request";
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

type RequestResult = { status: "committed" | "stale" };

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
  loadMore(): Promise<RequestResult>;
  refresh(): Promise<RequestResult>;
  remove(listId: string): void;
  upsert(item: SavedListSummaryDto): void;
  getState(): SavedListsPagerState;
} {
  let state: SavedListsPagerState = { items: [], nextCursor: null, loading: false };
  let initialized = false;
  let generation = 0;
  let loadMorePending: Promise<RequestResult> | null = null;
  let refreshPending: Promise<RequestResult> | null = null;
  let localRevision = 0;
  const localMutations = new Map<string, {
    revision: number;
    item: SavedListSummaryDto | null;
  }>();

  function replayLocalMutations(
    items: readonly SavedListSummaryDto[],
    baselineRevision: number,
  ): SavedListSummaryDto[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    localMutations.forEach((mutation, listId) => {
      if (mutation.revision <= baselineRevision) return;
      if (mutation.item) byId.set(listId, mutation.item);
      else byId.delete(listId);
    });
    return sortNewest([...byId.values()]);
  }

  async function request(reset: boolean): Promise<RequestResult> {
    if (!reset && initialized && state.nextCursor === null) return { status: "committed" };
    const requestGeneration = ++generation;
    const baselineRevision = localRevision;
    const cursor = reset ? null : state.nextCursor;
    state = { ...state, loading: true };
    try {
      const response = await dependencies.fetchPage(cursor
        ? { cursor, limit: 20 }
        : { limit: 20 });
      if (requestGeneration !== generation) return { status: "stale" };
      const serverCandidate = reset
        ? sortNewest(response.items)
        : mergeUnique(state.items, response.items);
      state = {
        items: replayLocalMutations(serverCandidate, baselineRevision),
        nextCursor: response.nextCursor,
        loading: false,
      };
      initialized = true;
      return { status: "committed" };
    } catch (error) {
      if (requestGeneration !== generation) return { status: "stale" };
      state = { ...state, loading: false };
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
      localRevision += 1;
      localMutations.set(listId, { revision: localRevision, item: null });
      state = { ...state, items: state.items.filter((item) => item.id !== listId) };
    },
    upsert(item) {
      localRevision += 1;
      localMutations.set(item.id, { revision: localRevision, item });
      state = { ...state, items: mergeUnique(state.items, [item]) };
      initialized = true;
    },
    getState() {
      return { ...state, items: state.items.map((item) => ({ ...item })) };
    },
  };
}

export function createDetailRequestCoordinator(dependencies: {
  load(listId: string): Promise<SavedListDetailDto>;
  commit(detail: SavedListDetailDto): void;
  fail(error: unknown): void;
}): {
  open(listId: string): Promise<{ status: "committed" | "failed" | "stale" }>;
  invalidate(): void;
} {
  let generation = 0;
  return {
    async open(listId) {
      const requestGeneration = ++generation;
      try {
        const detail = await dependencies.load(listId);
        if (requestGeneration !== generation) return { status: "stale" };
        dependencies.commit(detail);
        return { status: "committed" };
      } catch (error) {
        if (requestGeneration !== generation) return { status: "stale" };
        dependencies.fail(error);
        return { status: "failed" };
      }
    },
    invalidate() {
      generation += 1;
    },
  };
}

export function createCopyListController(dependencies: {
  newKey(): string;
  copy(listId: string, input: { name: string; idempotencyKey: string }): Promise<CopyListResultDto>;
}): {
  copy(intent: { listId: string; name: string }): Promise<
    | { status: "copied"; result: CopyListResultDto }
    | { status: "failed"; error: unknown }
  >;
  isPending(): boolean;
} {
  type Result =
    | { status: "copied"; result: CopyListResultDto }
    | { status: "failed"; error: unknown };
  let pending: Promise<Result> | null = null;
  let retainedKey: string | null = null;
  let retainedIntent = "";

  async function run(intent: { listId: string; name: string }): Promise<Result> {
    const signature = `${intent.listId}\n${intent.name}`;
    if (!retainedKey || retainedIntent !== signature) {
      retainedKey = dependencies.newKey();
      retainedIntent = signature;
    }
    try {
      const result = await dependencies.copy(intent.listId, {
        name: intent.name,
        idempotencyKey: retainedKey,
      });
      retainedKey = null;
      retainedIntent = "";
      return { status: "copied", result };
    } catch (error) {
      return { status: "failed", error };
    }
  }

  return {
    copy(intent) {
      pending ??= run(intent).finally(() => { pending = null; });
      return pending;
    },
    isPending: () => pending !== null,
  };
}

export function presentSavedListDetail(detail: SavedListDetailDto): {
  id: string;
  name: string;
  itemCount: number;
  totalText: string;
  updatedAt: string;
  items: Array<{
    position: number;
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
        position: item.position,
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
  fetchRemote(listId: string): Promise<SavedListDetailDto>;
  removeLocal(listId: string): void;
}): Promise<{ status: "deleted"; reconciled: boolean }> {
  try {
    await dependencies.deleteRemote(dependencies.listId);
    dependencies.removeLocal(dependencies.listId);
    return { status: "deleted", reconciled: false };
  } catch (deleteError) {
    if (deleteError instanceof ClientError && deleteError.status === 404) {
      dependencies.removeLocal(dependencies.listId);
      return { status: "deleted", reconciled: true };
    }
    let absent = false;
    try {
      await dependencies.fetchRemote(dependencies.listId);
    } catch (reconcileError) {
      absent = reconcileError instanceof ClientError && reconcileError.status === 404;
    }
    if (absent) {
      dependencies.removeLocal(dependencies.listId);
      return { status: "deleted", reconciled: true };
    }
    throw deleteError;
  }
}

void buildEditableDraft;
