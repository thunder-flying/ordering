import type { PublicDishDto } from "@ordering/contracts";
import { describe, expect, it } from "vitest";

import {
  buildDishQuery,
  createLatestRequestGuard,
  mergeDishPages,
  normalizeSearch,
  presentDishes,
} from "../../src/pages/select/model";

const dishes: PublicDishDto[] = [
  {
    id: "dish-1",
    categoryId: "cat-hot",
    name: "番茄牛腩",
    description: "慢炖至软嫩",
    imageUrl: "https://example.test/beef.jpg",
    referencePriceCents: 2_680,
    sortOrder: 1,
  },
  {
    id: "dish-2",
    categoryId: "cat-cold",
    name: "桂花藕",
    description: "清甜软糯",
    imageUrl: "",
    referencePriceCents: 880,
    sortOrder: 2,
  },
];

describe("select page model", () => {
  it("trims search text and builds a 20-item first-page query", () => {
    expect(normalizeSearch("  牛腩  ")).toBe("牛腩");
    expect(buildDishQuery({ query: "  牛腩  ", categoryId: "cat-hot", cursor: null })).toEqual({
      q: "牛腩",
      categoryId: "cat-hot",
      limit: 20,
    });
  });

  it("omits empty search, category, and cursor values from a page query", () => {
    expect(buildDishQuery({ query: "   ", categoryId: null, cursor: null })).toEqual({ limit: 20 });
    expect(buildDishQuery({ query: "藕", categoryId: null, cursor: "next-page" })).toEqual({
      q: "藕",
      cursor: "next-page",
      limit: 20,
    });
  });

  it("accepts only the latest request after searches race", () => {
    const requests = createLatestRequestGuard();
    const first = requests.begin();
    const second = requests.begin();

    expect(requests.isLatest(first)).toBe(false);
    expect(requests.isLatest(second)).toBe(true);
  });

  it("appends cursor pages without duplicating dishes", () => {
    expect(mergeDishPages([dishes[0]!], [dishes[0]!, dishes[1]!])).toEqual(dishes);
  });

  it("maps integer prices and favorite state for all and favorite-only views", () => {
    const favoriteIds = new Set(["dish-2"]);

    expect(presentDishes(dishes, favoriteIds, "all")).toEqual([
      expect.objectContaining({ id: "dish-1", priceText: "¥26.80", favorited: false }),
      expect.objectContaining({ id: "dish-2", priceText: "¥8.80", favorited: true }),
    ]);
    expect(presentDishes(dishes, favoriteIds, "favorites")).toEqual([
      expect.objectContaining({ id: "dish-2", priceText: "¥8.80", favorited: true }),
    ]);
  });
});
