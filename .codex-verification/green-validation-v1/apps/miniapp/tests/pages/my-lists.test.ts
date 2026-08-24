import type { CopyListResultDto, SavedListDetailDto, SavedListSummaryDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import {
  buildEditableDraft,
  createSavedListsPager,
  deleteSavedList,
  formatCopySkippedNotice,
  presentSavedListDetail,
} from "../../src/pages/my-lists/model";

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

  it("presents immutable saved snapshots in their original position order", () => {
    expect(presentSavedListDetail(detail)).toEqual({
      id: "list-new",
      name: "周五晚餐",
      itemCount: 2,
      totalText: "¥35.80",
      updatedAt: "2026-08-21T09:00:00.000Z",
      items: [
        {
          dishId: "dish-beef",
          name: "番茄牛腩（旧名）",
          referencePriceText: "¥13.50",
          quantity: 2,
          note: "少盐",
          subtotalText: "¥27.00",
          currentlyAvailable: false,
        },
        {
          dishId: "dish-lotus",
          name: "桂花藕",
          referencePriceText: "¥8.80",
          quantity: 1,
          note: "",
          subtotalText: "¥8.80",
          currentlyAvailable: true,
        },
        {
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
    const failure = new Error("offline");
    const failedCalls: string[] = [];

    await expect(deleteSavedList({
      listId: "list-new",
      deleteRemote: async (id: string) => { failedCalls.push(`remote:${id}`); throw failure; },
      removeLocal: (id: string) => { failedCalls.push(`local:${id}`); },
    })).rejects.toThrow("offline");
    expect(failedCalls).toEqual(["remote:list-new"]);

    const successfulCalls: string[] = [];
    await deleteSavedList({
      listId: "list-new",
      deleteRemote: async (id: string) => { successfulCalls.push(`remote:${id}`); },
      removeLocal: (id: string) => { successfulCalls.push(`local:${id}`); },
    });
    expect(successfulCalls).toEqual(["remote:list-new", "local:list-new"]);
  });
});
