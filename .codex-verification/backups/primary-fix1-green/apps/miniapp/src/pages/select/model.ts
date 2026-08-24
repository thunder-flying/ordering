import type { DishQuery } from "../../api/menu";
import type { PublicDishDto } from "@ordering/contracts";

import { formatCents } from "../../utils/price";

export type SelectFilter = "all" | "favorites";

export type DishCardView = PublicDishDto & {
  priceText: string;
  favorited: boolean;
};

export function normalizeSearch(value: string): string {
  return value.trim();
}

export function buildDishQuery(input: {
  query: string;
  categoryId: string | null;
  cursor: string | null;
}): DishQuery {
  const query = normalizeSearch(input.query);
  return {
    ...(query ? { q: query } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: 20,
  };
}

export function createLatestRequestGuard(): {
  begin(): number;
  isLatest(requestId: number): boolean;
} {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isLatest(requestId) {
      return requestId === latest;
    },
  };
}

export function mergeDishPages(
  current: readonly PublicDishDto[],
  incoming: readonly PublicDishDto[],
): PublicDishDto[] {
  const merged = new Map(current.map((dish) => [dish.id, dish]));
  incoming.forEach((dish) => merged.set(dish.id, dish));
  return [...merged.values()];
}

export function presentDishes(
  dishes: readonly PublicDishDto[],
  favoriteIds: ReadonlySet<string>,
  filter: SelectFilter,
): DishCardView[] {
  return dishes
    .filter((dish) => filter === "all" || favoriteIds.has(dish.id))
    .map((dish) => ({
      ...dish,
      priceText: formatCents(dish.referencePriceCents),
      favorited: favoriteIds.has(dish.id),
    }));
}
