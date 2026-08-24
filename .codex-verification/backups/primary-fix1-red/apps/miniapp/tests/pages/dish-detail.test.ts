import type { DishAvailabilityDto, PublicDishDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import { presentDishDetail } from "../../src/pages/dish-detail/model";

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

  it.each<[DishAvailabilityDto[], "unavailable" | "error"]>([
    [[{ dishId: "dish-1", available: false }], "unavailable"],
    [[], "error"],
    [[{ dishId: "another-dish", available: true, dish: { ...dish, id: "another-dish" } }], "error"],
  ])("distinguishes unavailable dishes from malformed availability responses", (items, status) => {
    expect(presentDishDetail("dish-1", items, new Set())).toEqual({ status });
  });
});
