import type { DishAvailabilityDto, PublicDishDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import {
  createDishDetailLoader,
  presentDishDetail,
  type DishDetailLoadState,
  type DishDetailPresentation,
} from "../../src/pages/dish-detail/model";

const dish: PublicDishDto = {
  id: "dish-1",
  categoryId: "cat-hot",
  name: "番茄牛腩",
  description: "番茄与牛腩慢炖，汤汁浓郁。",
  imageUrl: "https://example.test/beef.jpg",
  referencePriceCents: 2_680,
  sortOrder: 1,
};

describe("dish detail model", () => {
  it("maps an available dish to a complete display view", () => {
    const result = presentDishDetail("dish-1", [
      { dishId: "dish-1", available: true, dish },
    ], new Set(["dish-1"]));

    expect(result).toEqual({
      status: "ready",
      dish: expect.objectContaining({
        id: "dish-1",
        name: "番茄牛腩",
        description: "番茄与牛腩慢炖，汤汁浓郁。",
        priceText: "¥26.80",
        favorited: true,
      }),
    });
  });

  it("distinguishes unavailable dishes from malformed availability responses", () => {
    expect(presentDishDetail("dish-1", [{ dishId: "dish-1", available: false }], new Set())).toEqual({ status: "unavailable" });
    expect(presentDishDetail("dish-1", [], new Set())).toEqual({
      status: "error",
      errorMessage: "菜品信息暂时不完整，请重新加载。",
    });
    const mismatched: DishAvailabilityDto[] = [{ dishId: "another-dish", available: true, dish: { ...dish, id: "another-dish" } }];
    expect(presentDishDetail("dish-1", mismatched, new Set())).toEqual({
      status: "error",
      errorMessage: "菜品信息暂时不完整，请重新加载。",
    });
  });

  it("keeps the fast unavailable result when an older available request resolves later", async () => {
    let resolveSlow!: (value: DishDetailPresentation) => void;
    const states: DishDetailLoadState[] = [];
    const loader = createDishDetailLoader({
      load: (dishId) => dishId === "slow"
        ? new Promise<DishDetailPresentation>((resolve) => { resolveSlow = resolve; })
        : Promise.resolve({ status: "unavailable" }),
      apply: (state) => { states.push(state); },
      formatError: () => "加载失败，请重试。",
    });

    const slow = loader.load("slow");
    await loader.load("fast");
    resolveSlow({ status: "ready", dish: { ...dish, priceText: "¥26.80", favorited: false } });
    await slow;

    expect(states.at(-1)).toEqual({
      status: "unavailable",
      dish: null,
      errorMessage: "",
      imageFailed: false,
    });
    expect(states.some((state) => state.status === "ready")).toBe(false);
  });

  it("does not apply a pending result after the loader is invalidated", async () => {
    let resolvePending!: (value: DishDetailPresentation) => void;
    const states: DishDetailLoadState[] = [];
    const loader = createDishDetailLoader({
      load: () => new Promise<DishDetailPresentation>((resolve) => { resolvePending = resolve; }),
      apply: (state) => { states.push(state); },
      formatError: () => "加载失败，请重试。",
    });

    const pending = loader.load("dish-1");
    loader.invalidate();
    resolvePending({ status: "ready", dish: { ...dish, priceText: "¥26.80", favorited: false } });
    await pending;

    expect(states).toEqual([{
      status: "loading",
      dish: null,
      errorMessage: "",
      imageFailed: false,
    }]);
  });
});
