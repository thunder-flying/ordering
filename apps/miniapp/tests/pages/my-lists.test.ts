import type { CopyListResultDto, SavedListDetailDto, SavedListSummaryDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import { ClientError } from "../../src/api/request";
import * as listModel from "../../src/pages/my-lists/model";

const {
  buildEditableDraft,
  createSavedListsPager,
  deleteSavedList,
  formatCopySkippedNotice,
  presentSavedListDetail,
} = listModel;

const newest: SavedListSummaryDto = {
  id: "list-new",
  name: "周五晚餐",
  itemCount: 2,
  totalCents: 3_580,
  createdAt: "2026-08-20T08:00:00.000Z",
  updatedAt: "2026-08-21T09:00:00.000Z",
};

const older: SavedListSummaryDto = {
  id: "list-old",
  name: "周四晚餐",
  itemCount: 1,
  totalCents: 880,
  createdAt: "2026-08-19T08:00:00.000Z",
  updatedAt: "2026-08-20T09:00:00.000Z",
};

const oldest: SavedListSummaryDto = {
  id: "list-oldest",
  name: "周三晚餐",
  itemCount: 1,
  totalCents: 500,
  createdAt: "2026-08-18T08:00:00.000Z",
  updatedAt: "2026-08-19T09:00:00.000Z",
};

const detail: SavedListDetailDto = {
  ...newest,
  items: [
    {
      dishId: "dish-lotus",
      nameSnapshot: "桂花藕",
      referencePriceCentsSnapshot: 880,
      quantity: 1,
      note: "",
      position: 2,
      currentlyAvailable: true,
    },
    {
      dishId: "dish-beef",
      nameSnapshot: "番茄牛腩（旧名）",
      referencePriceCentsSnapshot: 1_350,
      quantity: 2,
      note: "少盐",
      position: 1,
      currentlyAvailable: false,
    },
    {
      dishId: null,
      nameSnapshot: "已删除菜品",
      referencePriceCentsSnapshot: 0,
      quantity: 1,
      note: "历史备注",
      position: 3,
      currentlyAvailable: true,
    },
  ],
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  return {
    promise: new Promise<T>((done, fail) => { resolve = done; reject = fail; }),
    resolve,
    reject,
  };
}

function requiredFactory<T>(name: string): T {
  const value = (listModel as Record<string, unknown>)[name];
  expect(value, `${name} must be exported for the page to use`).toBeTypeOf("function");
  return value as T;
}

type DetailCoordinatorFactory = (dependencies: {
  load(listId: string): Promise<SavedListDetailDto>;
  commit(detail: SavedListDetailDto): void;
  fail(error: unknown): void;
}) => {
  open(listId: string): Promise<{ status: "committed" | "failed" | "stale" }>;
  invalidate(): void;
};

type CopyControllerFactory = (dependencies: {
  newKey(): string;
  copy(listId: string, input: { name: string; idempotencyKey: string }): Promise<CopyListResultDto>;
}) => {
  copy(intent: { listId: string; name: string }): Promise<
    | { status: "copied"; result: CopyListResultDto }
    | { status: "failed"; error: unknown }
  >;
  isPending(): boolean;
};

describe("my-lists page model", () => {
  it("loads cursor pages newest-first, deduplicates ids, and stops after a null cursor", async () => {
    const queries: Array<{ cursor?: string; limit: number }> = [];
    const responses = [
      { items: [older, newest], nextCursor: "cursor-2" },
      { items: [newest, oldest], nextCursor: null },
    ];
    const pager = createSavedListsPager({
      fetchPage: async (query: { cursor?: string; limit: number }) => {
        queries.push(query);
        return responses[queries.length - 1]!;
      },
    });

    await pager.loadMore();
    await pager.loadMore();
    await pager.loadMore();

    expect(queries).toEqual([
      { limit: 20 },
      { cursor: "cursor-2", limit: 20 },
    ]);
    expect(pager.getState().items.map((item: SavedListSummaryDto) => item.id)).toEqual([
      "list-new",
      "list-old",
      "list-oldest",
    ]);
    expect(pager.getState().nextCursor).toBeNull();
  });

  it("replaces old pagination state during refresh", async () => {
    let calls = 0;
    const refreshed: SavedListSummaryDto = {
      ...newest,
      id: "list-refreshed",
      name: "刚刚更新",
      updatedAt: "2026-08-21T12:00:00.000Z",
    };
    const pager = createSavedListsPager({
      fetchPage: async (_query: { cursor?: string; limit: number }) => {
        calls += 1;
        return calls === 1
          ? { items: [older], nextCursor: "old-cursor" }
          : { items: [refreshed], nextCursor: null };
      },
    });

    await pager.loadMore();
    await pager.refresh();

    expect(pager.getState().items).toEqual([refreshed]);
    expect(pager.getState().nextCursor).toBeNull();
  });

  it("treats an older load-more failure as stale after a refresh commits", async () => {
    const oldPage = deferred<{ items: SavedListSummaryDto[]; nextCursor: string | null }>();
    const freshPage = deferred<{ items: SavedListSummaryDto[]; nextCursor: string | null }>();
    let calls = 0;
    const pager = createSavedListsPager({
      fetchPage: async (_query: { cursor?: string; limit: number }) => {
        calls += 1;
        return calls === 1 ? oldPage.promise : freshPage.promise;
      },
    });

    const loadingMore = pager.loadMore();
    const refreshing = pager.refresh();
    freshPage.resolve({ items: [newest], nextCursor: null });
    await expect(refreshing).resolves.toEqual({ status: "committed" });

    const oldFailure = new Error("old page offline");
    oldPage.reject(oldFailure);
    await expect(loadingMore).resolves.toEqual({ status: "stale" });
    expect(pager.getState()).toMatchObject({ items: [newest], nextCursor: null, loading: false });
  });

  it("does not let an older load-more success overwrite a refreshed page", async () => {
    const oldPage = deferred<{ items: SavedListSummaryDto[]; nextCursor: string | null }>();
    const freshPage = deferred<{ items: SavedListSummaryDto[]; nextCursor: string | null }>();
    let calls = 0;
    const pager = createSavedListsPager({
      fetchPage: async (_query: { cursor?: string; limit: number }) => {
        calls += 1;
        return calls === 1 ? oldPage.promise : freshPage.promise;
      },
    });

    const loadingMore = pager.loadMore();
    const refreshing = pager.refresh();
    freshPage.resolve({ items: [newest], nextCursor: null });
    await expect(refreshing).resolves.toEqual({ status: "committed" });
    oldPage.resolve({ items: [oldest], nextCursor: "obsolete" });
    await expect(loadingMore).resolves.toEqual({ status: "stale" });

    expect(pager.getState()).toMatchObject({ items: [newest], nextCursor: null, loading: false });
  });

  it("preserves a local upsert made while an older refresh response is pending", async () => {
    const refreshPage = deferred<{ items: SavedListSummaryDto[]; nextCursor: string | null }>();
    const locallyUpdated: SavedListSummaryDto = {
      ...newest,
      name: "周五晚餐（本地更新）",
      updatedAt: "2026-08-22T09:00:00.000Z",
    };
    const pager = createSavedListsPager({
      fetchPage: async (_query: { cursor?: string; limit: number }) => refreshPage.promise,
    });

    const refreshing = pager.refresh();
    pager.upsert(locallyUpdated);
    refreshPage.resolve({ items: [newest, older], nextCursor: null });

    await expect(refreshing).resolves.toEqual({ status: "committed" });
    expect(pager.getState()).toMatchObject({ nextCursor: null, loading: false });
    expect(pager.getState().items.map((item: SavedListSummaryDto) => [item.id, item.name])).toEqual([
      ["list-new", "周五晚餐（本地更新）"],
      ["list-old", "周四晚餐"],
    ]);
  });

  it("does not revive a locally removed list from an older load-more response", async () => {
    const nextPage = deferred<{ items: SavedListSummaryDto[]; nextCursor: string | null }>();
    let calls = 0;
    const pager = createSavedListsPager({
      fetchPage: async (_query: { cursor?: string; limit: number }) => {
        calls += 1;
        return calls === 1
          ? { items: [newest], nextCursor: "cursor-2" }
          : nextPage.promise;
      },
    });
    await pager.loadMore();

    const loadingMore = pager.loadMore();
    pager.remove(newest.id);
    nextPage.resolve({ items: [newest, older], nextCursor: null });

    await expect(loadingMore).resolves.toEqual({ status: "committed" });
    expect(pager.getState()).toMatchObject({ nextCursor: null, loading: false });
    expect(pager.getState().items.map((item: SavedListSummaryDto) => item.id)).toEqual(["list-old"]);
  });
  it("upserts details and copied lists into the pager in newest-first order", async () => {
    const pager = createSavedListsPager({
      fetchPage: async (_query: { cursor?: string; limit: number }) => ({
        items: [older],
        nextCursor: null,
      }),
    });
    await pager.loadMore();
    expect((pager as unknown as { upsert?: unknown }).upsert).toBeTypeOf("function");
    const upsert = (pager as unknown as { upsert(item: SavedListSummaryDto): void }).upsert;

    upsert(newest);
    upsert({ ...older, name: "周四晚餐（已更新）", updatedAt: "2026-08-22T09:00:00.000Z" });

    expect(pager.getState().items.map((item: SavedListSummaryDto) => [item.id, item.name])).toEqual([
      ["list-old", "周四晚餐（已更新）"],
      ["list-new", "周五晚餐"],
    ]);
  });

  it("invalidates unfinished detail requests and allows a later detail to commit", async () => {
    const createCoordinator = requiredFactory<DetailCoordinatorFactory>("createDetailRequestCoordinator");
    const oldDetail = deferred<SavedListDetailDto>();
    const oldFailure = deferred<SavedListDetailDto>();
    const committed: string[] = [];
    const failures: string[] = [];
    const coordinator = createCoordinator({
      load: (listId) => {
        if (listId === "old-success") return oldDetail.promise;
        if (listId === "old-failure") return oldFailure.promise;
        return Promise.resolve({ ...detail, id: listId, name: "新的详情" });
      },
      commit: (value) => { committed.push(value.id); },
      fail: (error) => { failures.push(String(error)); },
    });

    const staleSuccess = coordinator.open("old-success");
    coordinator.invalidate();
    oldDetail.resolve(detail);
    await expect(staleSuccess).resolves.toEqual({ status: "stale" });

    const staleFailure = coordinator.open("old-failure");
    coordinator.invalidate();
    oldFailure.reject(new Error("obsolete detail failure"));
    await expect(staleFailure).resolves.toEqual({ status: "stale" });

    await expect(coordinator.open("new-detail")).resolves.toEqual({ status: "committed" });
    expect(committed).toEqual(["new-detail"]);
    expect(failures).toEqual([]);
  });

  it("reuses one copy idempotency key across failure and pending retry, then rotates after success", async () => {
    const createCopyController = requiredFactory<CopyControllerFactory>("createCopyListController");
    const copied: CopyListResultDto = {
      list: { ...detail, id: "list-copy", name: "周五晚餐（复制）" },
      skippedItemNames: [],
    };
    const retryResponse = deferred<CopyListResultDto>();
    const keys = [
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000022",
    ];
    const usedKeys: string[] = [];
    let calls = 0;
    const controller = createCopyController({
      newKey: () => keys.shift()!,
      copy: async (_listId, input) => {
        calls += 1;
        usedKeys.push(input.idempotencyKey);
        if (calls === 1) throw new Error("offline");
        if (calls === 2) return retryResponse.promise;
        return { ...copied, list: { ...copied.list, id: "list-copy-2" } };
      },
    });
    const intent = { listId: "list-new", name: "周五晚餐（复制）" };

    await expect(controller.copy(intent)).resolves.toMatchObject({ status: "failed" });
    const retry = controller.copy(intent);
    const duplicateTap = controller.copy(intent);
    await Promise.resolve();
    expect({ calls, pending: controller.isPending() }).toEqual({ calls: 2, pending: true });
    retryResponse.resolve(copied);
    await expect(Promise.all([retry, duplicateTap])).resolves.toEqual([
      { status: "copied", result: copied },
      { status: "copied", result: copied },
    ]);

    await expect(controller.copy(intent)).resolves.toMatchObject({ status: "copied" });
    expect(usedKeys).toEqual([
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000022",
    ]);
  });

  it("presents immutable snapshots with stable unique positions", () => {
    const presented = presentSavedListDetail(detail);
    expect(presented).toEqual({
      id: "list-new",
      name: "周五晚餐",
      itemCount: 2,
      totalText: "¥35.80",
      updatedAt: "2026-08-21T09:00:00.000Z",
      items: [
        {
          position: 1,
          dishId: "dish-beef",
          name: "番茄牛腩（旧名）",
          referencePriceText: "¥13.50",
          quantity: 2,
          note: "少盐",
          subtotalText: "¥27.00",
          currentlyAvailable: false,
        },
        {
          position: 2,
          dishId: "dish-lotus",
          name: "桂花藕",
          referencePriceText: "¥8.80",
          quantity: 1,
          note: "",
          subtotalText: "¥8.80",
          currentlyAvailable: true,
        },
        {
          position: 3,
          dishId: null,
          name: "已删除菜品",
          referencePriceText: "¥0.00",
          quantity: 1,
          note: "历史备注",
          subtotalText: "¥0.00",
          currentlyAvailable: true,
        },
      ],
    });
    expect(new Set(presented.items.map((item) => item.position)).size).toBe(presented.items.length);
  });

  it("builds a replaceDraft edit target from only available items with dish ids", () => {
    expect(buildEditableDraft(detail)).toEqual({
      draft: {
        name: "周五晚餐",
        items: [
          {
            dishId: "dish-lotus",
            name: "桂花藕",
            imageUrl: null,
            referencePriceCents: 880,
            quantity: 1,
            note: "",
          },
        ],
        editTarget: {
          listId: "list-new",
          expectedUpdatedAt: "2026-08-21T09:00:00.000Z",
        },
      },
      skippedItemNames: ["番茄牛腩（旧名）", "已删除菜品"],
    });
  });

  it("describes copy results that skipped unavailable items", () => {
    const copied: CopyListResultDto = {
      list: { ...detail, id: "list-copy", name: "周五晚餐（复制）" },
      skippedItemNames: ["番茄牛腩（旧名）", "已删除菜品"],
    };

    expect(formatCopySkippedNotice(copied.skippedItemNames)).toBe(
      "已跳过不可用菜品：番茄牛腩（旧名）、已删除菜品",
    );
    expect(formatCopySkippedNotice([])).toBe("");
  });

  it("removes a list locally only after remote deletion succeeds", async () => {
    const successfulCalls: string[] = [];
    await expect(deleteSavedList({
      listId: "list-new",
      deleteRemote: async (id: string) => { successfulCalls.push(`remote:${id}`); },
      fetchRemote: async (_id: string) => detail,
      removeLocal: (id: string) => { successfulCalls.push(`local:${id}`); },
    })).resolves.toEqual({ status: "deleted", reconciled: false });
    expect(successfulCalls).toEqual(["remote:list-new", "local:list-new"]);
  });

  it("reconciles a lost delete response as success when the list is already absent", async () => {
    const timeout = new Error("request timed out");
    const calls: string[] = [];
    await expect(deleteSavedList({
      listId: "list-new",
      deleteRemote: async (id: string) => { calls.push(`remote:${id}`); throw timeout; },
      fetchRemote: async (id: string) => {
        calls.push(`reconcile:${id}`);
        throw new ClientError("清单不存在", { status: 404 });
      },
      removeLocal: (id: string) => { calls.push(`local:${id}`); },
    })).resolves.toEqual({ status: "deleted", reconciled: true });
    expect(calls).toEqual(["remote:list-new", "reconcile:list-new", "local:list-new"]);
  });

  it("treats a direct delete 404 as reconciled without fetching the list again", async () => {
    const calls: string[] = [];
    await expect(deleteSavedList({
      listId: "list-new",
      deleteRemote: async (id: string) => {
        calls.push(`remote:${id}`);
        throw new ClientError("清单不存在", { status: 404 });
      },
      fetchRemote: async (id: string) => {
        calls.push(`reconcile:${id}`);
        return detail;
      },
      removeLocal: (id: string) => { calls.push(`local:${id}`); },
    })).resolves.toEqual({ status: "deleted", reconciled: true });
    expect(calls).toEqual(["remote:list-new", "local:list-new"]);
  });
  it("retains the local list and reports the original delete error when reconciliation is inconclusive", async () => {
    const timeout = new Error("request timed out");
    let removeCalls = 0;
    await expect(deleteSavedList({
      listId: "list-new",
      deleteRemote: async (_id: string) => { throw timeout; },
      fetchRemote: async (_id: string) => detail,
      removeLocal: (_id: string) => { removeCalls += 1; },
    })).rejects.toBe(timeout);
    expect(removeCalls).toBe(0);

    await expect(deleteSavedList({
      listId: "list-new",
      deleteRemote: async (_id: string) => { throw timeout; },
      fetchRemote: async (_id: string) => { throw new Error("reconcile offline"); },
      removeLocal: (_id: string) => { removeCalls += 1; },
    })).rejects.toBe(timeout);
    expect(removeCalls).toBe(0);
  });
});
