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

function availableItems(draft: Draft): DishAvailabilityDto[] {
  return draft.items.map((item, index) => ({
    dishId: item.dishId,
    available: true as const,
    dish: {
      id: item.dishId,
      categoryId: "cat-hot",
      name: item.name,
      description: "",
      imageUrl: item.imageUrl ?? "",
      referencePriceCents: item.referencePriceCents,
      sortOrder: index,
    },
  }));
}

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

function saveDependencies(overrides: Partial<{
  getDraft(): Draft;
  fetchAvailability(ids: string[]): Promise<{ items: DishAvailabilityDto[] }>;
  applyAvailability(result: ReturnType<typeof mergeDraftAvailability>): void;
  create(input: unknown): Promise<SavedListDetailDto>;
  update(listId: string, input: unknown): Promise<SavedListDetailDto>;
  clearDraft(): void;
}> = {}) {
  const draft = makeDraft();
  return {
    getDraft: () => draft,
    fetchAvailability: async (_ids: string[]) => ({ items: availableItems(draft) }),
    applyAvailability: (_result: ReturnType<typeof mergeDraftAvailability>) => undefined,
    create: async (_input: unknown) => savedList,
    update: async (_listId: string, _input: unknown) => savedList,
    clearDraft: () => undefined,
    ...overrides,
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

  it("rechecks availability at save time and blocks a dish that became unavailable", async () => {
    const draft = makeDraft();
    const initial = mergeDraftAvailability(draft.items, availableItems(draft));
    expect(initial.unavailableNames).toEqual([]);

    let availabilityCalls = 0;
    let createCalls = 0;
    let updateCalls = 0;
    let clearCalls = 0;
    const applied: Array<ReturnType<typeof mergeDraftAvailability>> = [];
    const controller = createCurrentListSaveController(saveDependencies({
      getDraft: () => draft,
      fetchAvailability: async (ids: string[]) => {
        availabilityCalls += 1;
        expect(ids).toEqual(["dish-beef", "dish-lotus"]);
        return {
          items: [availableItems(draft)[0]!, { dishId: "dish-lotus", available: false }],
        };
      },
      applyAvailability: (result) => { applied.push(result); },
      create: async (_input: unknown) => { createCalls += 1; return savedList; },
      update: async (_listId: string, _input: unknown) => { updateCalls += 1; return savedList; },
      clearDraft: () => { clearCalls += 1; },
    }));

    await expect(controller.save()).resolves.toEqual({
      status: "unavailable",
      unavailableNames: ["桂花藕"],
    });
    expect({ availabilityCalls, createCalls, updateCalls, clearCalls }).toEqual({
      availabilityCalls: 1,
      createCalls: 0,
      updateCalls: 0,
      clearCalls: 0,
    });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.items.find((item) => item.dishId === "dish-lotus")?.available).toBe(false);
  });

  it("does not save an availability snapshot after the draft mutation key changes", async () => {
    let draft = makeDraft();
    const availability = deferred<{ items: DishAvailabilityDto[] }>();
    let createCalls = 0;
    let clearCalls = 0;
    let applyCalls = 0;
    const controller = createCurrentListSaveController(saveDependencies({
      getDraft: () => draft,
      fetchAvailability: async (_ids: string[]) => availability.promise,
      applyAvailability: () => { applyCalls += 1; },
      create: async (_input: unknown) => { createCalls += 1; return savedList; },
      clearDraft: () => { clearCalls += 1; },
    }));

    const saving = controller.save();
    await Promise.resolve();
    const oldDraft = draft;
    draft = {
      ...oldDraft,
      mutationKey: "00000000-0000-4000-8000-000000000099",
      items: oldDraft.items.map((item, index) => index === 0 ? { ...item, quantity: 3 } : item),
    };
    availability.resolve({ items: availableItems(oldDraft) });

    await expect(saving).resolves.toEqual({ status: "stale" });
    expect({ createCalls, clearCalls, applyCalls }).toEqual({
      createCalls: 0,
      clearCalls: 0,
      applyCalls: 0,
    });
  });

  it("coalesces two save taps while pending into one availability check and create request", async () => {
    const draft = makeDraft();
    const response = deferred<SavedListDetailDto>();
    let availabilityCalls = 0;
    let createCalls = 0;
    let clearCalls = 0;
    const controller = createCurrentListSaveController(saveDependencies({
      getDraft: () => draft,
      fetchAvailability: async (_ids: string[]) => {
        availabilityCalls += 1;
        return { items: availableItems(draft) };
      },
      create: async (_input: unknown) => { createCalls += 1; return response.promise; },
      clearDraft: () => { clearCalls += 1; },
    }));

    const first = controller.save();
    const second = controller.save();
    await Promise.resolve();

    expect(availabilityCalls).toBe(1);
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
    const controller = createCurrentListSaveController(saveDependencies({
      getDraft: () => currentDraft,
      fetchAvailability: async (_ids: string[]) => ({ items: availableItems(currentDraft) }),
      create: async (_input: unknown) => { throw failure; },
      clearDraft: () => { currentDraft = makeDraft(); currentDraft.items = []; },
    }));

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
    const controller = createCurrentListSaveController(saveDependencies({
      getDraft: () => original,
      fetchAvailability: async (_ids: string[]) => ({ items: availableItems(original) }),
      update: async (_listId: string, _input: unknown) => { throw conflict; },
      clearDraft: () => { cleared = true; },
    }));

    await expect(controller.save()).resolves.toEqual({
      status: "conflict",
      recoverable: true,
      error: conflict,
    });
    expect(cleared).toBe(false);
    expect(controller.isPending()).toBe(false);
  });
});
