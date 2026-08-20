import { describe, expect, it } from "vitest";

import {
  CategoryInput,
  DishAvailabilityRequest,
  DishSearch,
} from "./menu";

describe("menu contracts", () => {
  it("normalizes category and search inputs", () => {
    expect(
      CategoryInput.parse({ name: " 热菜 ", sortOrder: 2, enabled: true }),
    ).toEqual({ name: "热菜", sortOrder: 2, enabled: true });
    expect(DishSearch.parse({ q: " 番茄 ", limit: "10" })).toEqual({
      q: "番茄",
      limit: 10,
    });
  });

  it("rejects duplicate availability IDs", () => {
    const dishId = "cm12345678901234567890123";
    expect(() =>
      DishAvailabilityRequest.parse({ dishIds: [dishId, dishId] }),
    ).toThrow();
  });
});
