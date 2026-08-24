import type { PublicCategoryDto, PublicDishDto } from "@ordering/contracts";
import type { DishQuery } from "../../api/menu";

import { formatCents } from "../../utils/price";

export type SelectFilter = "all" | "favorites";

export type DishCardView = PublicDishDto & {
  priceText: string;
  favorited: boolean;
};

export type SelectLoadKind = "reset" | "refresh" | "more" | "favorites";
export type SelectLoadingPatch = {
  loading?: boolean;
  loadingMore?: boolean;
  errorMessage?: string;
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

export function createSelectLoadCoordinator(apply: (patch: SelectLoadingPatch) => void): {
  begin(kind: SelectLoadKind): number;
  switchMode(): void;
  commit(requestId: number, patch: SelectLoadingPatch): boolean;
  fail(requestId: number, message: string): boolean;
  invalidate(): void;
} {
  let latest = 0;
  const commit = (requestId: number, patch: SelectLoadingPatch): boolean => {
    if (requestId !== latest) return false;
    apply(patch);
    return true;
  };
  return {
    begin(kind) {
      latest += 1;
      if (kind === "more") apply({ loadingMore: true, errorMessage: "" });
      else apply({ loading: kind !== "refresh", loadingMore: false, errorMessage: "" });
      return latest;
    },
    switchMode() {
      latest += 1;
      apply({ loadingMore: false, errorMessage: "" });
    },
    commit,
    fail(requestId, message) {
      return commit(requestId, { loading: false, loadingMore: false, errorMessage: message });
    },
    invalidate() {
      latest += 1;
      apply({ loadingMore: false });
    },
  };
}

export type SelectRefreshOperations = {
  loadFavorites(): Promise<void>;
  loadCategories(): Promise<PublicCategoryDto[]>;
  reloadDishes(categories: PublicCategoryDto[]): Promise<void>;
  stop(): void;
};

export async function runSelectRefresh(
  operations: SelectRefreshOperations,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const [, categories] = await Promise.all([
      operations.loadFavorites(),
      operations.loadCategories(),
    ]);
    await operations.reloadDishes(categories);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  } finally {
    operations.stop();
  }
}

export function presentRefreshFailure(message: string, hasItems: boolean): {
  blockingError: string;
  refreshNotice: string;
} {
  return hasItems
    ? { blockingError: "", refreshNotice: message }
    : { blockingError: message, refreshNotice: "" };
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
