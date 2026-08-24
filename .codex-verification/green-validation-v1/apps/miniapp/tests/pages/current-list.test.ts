import type { DishAvailabilityDto, SavedListDetailDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import { ClientError } from "../../src/api/request";
import type { Draft } from "../../src/state/draft";
import {
  buildSaveOperation,
  createCurrentListSaveController,
  mergeDraftAvailability,
} from "../../src/pages/current-list/model";

const savedList: SavedListDetailDto = {
  id: "list-1",
  name: "周末家常菜",
  itemCount: 2,
  totalCents: 3_880,
  createdAt: "2026-08-20T08:00:00.000Z",
  updatedAt: "2026-08-20T08:00:00.000Z",
  items: [],
};

function makeDraft(editTarget: Draft["editTarget"] = null): Draft {
  return {
    version: 1,
    name: "周末家常菜",
    items: [
      {
        dishId: "dish-beef",
        name: "番茄牛腩",
        imageUrl: "https://example.test/beef.jpg",
        referencePriceCents: 1_299,
        quantity: 2,
        note: "少盐",
      },
      {
        dishId: "dish-lotus",
        name: "桂花藕",
        imageUrl: null,
        referencePriceCents: 880,
        quantity: 1,
        note: "",
      },
    ],
    editTarget,
    mutationKey: "00000000-0000-4000-8000-000000000001",
    updatedAt: "2026-08-21T08:00:00.000Z",
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => { resolve = done; }),
    resolve,
  };
}

describe("current-list page model", () => {
  it("merges current prices while retaining and marking unavailable draft items", () => {
    const draft = makeDraft();
    const availability: DishAvailabilityDto[] = [
      {
        dishId: "dish-beef",
        available: true,
        dish: {
          id: "dish-beef",
          categoryId: "cat-hot",
          name: "番茄牛腩",
          description: "慢炖至软嫩",
          imageUrl: "https://example.test/beef-new.jpg",
          referencePriceCents: 1_500,
          sortOrder: 1,
        },
      },
      { dishId: "dish-lotus", available: false },
    ];

    expect(mergeDraftAvailability(draft.items, availability)).toEqual({
      items: [
        {
          ...draft.items[0],
          imageUrl: "https://example.test/beef-new.jpg",
          referencePriceCents: 1_500,
          available: true,
        },
        { ...draft.items[1], available: false },
      ],
      unavailableNames: ["桂花藕"],
    });
  });

  it("builds a create payload without client-owned prices or display fields", () => {
    expect(buildSaveOperation(makeDraft())).toEqual({
      kind: "create",
      input: {
        name: "周末家常菜",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        items: [
          { dishId: "dish-beef", quantity: 2, note: "少盐" },
          { dishId: "dish-lotus", quantity: 1, note: "" },
        ],
      },
    });
  });

  it("builds an update payload for an edit target with expectedUpdatedAt", () => {
    expect(buildSaveOperation(makeDraft({
      listId: "list/edit",
      expectedUpdatedAt: "2026-08-20T09:30:00.000Z",
    }))).toEqual({
      kind: "update",
      listId: "list/edit",
      input: {
        name: "周末家常菜",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        expectedUpdatedAt: "2026-08-20T09:30:00.000Z",
        items: [
          { dishId: "dish-beef", quantity: 2, note: "少盐" },
          { dishId: "dish-lotus", quantity: 1, note: "" },
        ],
      },
    });
  });

  it("coalesces two save taps while pending into one create request", async () => {
    const response = deferred<SavedListDetailDto>();
    let createCalls = 0;
    let clearCalls = 0;
    const controller = createCurrentListSaveController({
      getDraft: () => makeDraft(),
      create: async (_input: unknown) => { createCalls += 1; return response.promise; },
      update: async (_listId: string, _input: unknown) => savedList,
      clearDraft: () => { clearCalls += 1; },
    });

    const first = controller.save();
    const second = controller.save();
    await Promise.resolve();

    expect(createCalls).toBe(1);
    expect(clearCalls).toBe(0);
    expect(controller.isPending()).toBe(true);

    response.resolve(savedList);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "saved", list: savedList },
      { status: "saved", list: savedList },
    ]);
    expect(clearCalls).toBe(1);
    expect(controller.isPending()).toBe(false);
  });

  it("preserves the complete draft after an ordinary save failure", async () => {
    const original = makeDraft();
    let currentDraft = original;
    const failure = new Error("offline");
    const controller = createCurrentListSaveController({
      getDraft: () => currentDraft,
      create: async (_input: unknown) => { throw failure; },
      update: async (_listId: string, _input: unknown) => savedList,
      clearDraft: () => { currentDraft = makeDraft(); currentDraft.items = []; },
    });

    await expect(controller.save()).resolves.toEqual({ status: "failed", error: failure });
    expect(currentDraft).toEqual(original);
  });

  it("marks a 409 update conflict as recoverable and keeps the edit draft", async () => {
    const original = makeDraft({
      listId: "list-1",
      expectedUpdatedAt: "2026-08-20T09:30:00.000Z",
    });
    let cleared = false;
    const conflict = new ClientError("清单已在别处更新", { status: 409, requestId: "req-conflict" });
    const controller = createCurrentListSaveController({
      getDraft: () => original,
      create: async (_input: unknown) => savedList,
      update: async (_listId: string, _input: unknown) => { throw conflict; },
      clearDraft: () => { cleared = true; },
    });

    await expect(controller.save()).resolves.toEqual({
      status: "conflict",
      recoverable: true,
      error: conflict,
    });
    expect(cleared).toBe(false);
    expect(controller.isPending()).toBe(false);
  });
});
