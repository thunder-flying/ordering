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

export type SelectLoadResult =
  | { status: "committed" }
  | { status: "stale" }
  | { status: "failed"; error: unknown };

type DishOwner = "bootstrap" | "refresh" | "user";
type SelectRetrySource = "bootstrap" | "refresh";

type BootstrapOperations = {
  loadCategories(): Promise<PublicCategoryDto[]>;
  commitCategories(categories: PublicCategoryDto[]): void;
  loadFavorites(): Promise<void>;
  loadInitialDishes(): Promise<SelectLoadResult>;
  currentFilter(): SelectFilter;
  reloadFavorites(): Promise<SelectLoadResult>;
  fail(error: unknown): void;
};

type RefreshOperations = {
  start(): void;
  run(): Promise<SelectLoadResult>;
  succeed(): void;
  fail(error: unknown): void;
  stop(): void;
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

export function createSelectOrchestrationController(options: {
  onRefreshCancelled(): void;
}): {
  runDish<T>(operations: {
    owner: DishOwner;
    start?(): void;
    load(): Promise<T>;
    commit(value: T): void;
    fail?(error: unknown): void;
  }): Promise<SelectLoadResult>;
  runBootstrap(operations: BootstrapOperations): Promise<SelectLoadResult>;
  runRefresh(operations: RefreshOperations): Promise<SelectLoadResult>;
  cancelRefresh(): void;
  retrySource(): SelectRetrySource | null;
  retry(): Promise<SelectLoadResult>;
  invalidate(): void;
} {
  let dishGeneration = 0;
  let bootstrapGeneration = 0;
  let refreshGeneration = 0;
  let retryRegistration: {
    source: SelectRetrySource;
    run(): Promise<SelectLoadResult>;
  } | undefined;

  const clearRetry = (source: SelectRetrySource): void => {
    if (retryRegistration?.source === source) retryRegistration = undefined;
  };

  const cancelRefresh = (): void => {
    refreshGeneration += 1;
    clearRetry("refresh");
    options.onRefreshCancelled();
  };

  const runDish = async <T>(operations: {
    owner: DishOwner;
    start?(): void;
    load(): Promise<T>;
    commit(value: T): void;
    fail?(error: unknown): void;
  }): Promise<SelectLoadResult> => {
    if (operations.owner === "user") cancelRefresh();
    dishGeneration += 1;
    const requestId = dishGeneration;
    operations.start?.();
    try {
      const value = await operations.load();
      if (requestId !== dishGeneration) return { status: "stale" };
      operations.commit(value);
      return { status: "committed" };
    } catch (error) {
      if (requestId !== dishGeneration) return { status: "stale" };
      operations.fail?.(error);
      return { status: "failed", error };
    }
  };

  const runBootstrap = async (operations: BootstrapOperations): Promise<SelectLoadResult> => {
    bootstrapGeneration += 1;
    const requestId = bootstrapGeneration;
    let sourceError: unknown;
    const categories = operations.loadCategories().then(
      (items) => {
        if (requestId === bootstrapGeneration) operations.commitCategories(items);
      },
      (error: unknown) => { sourceError ??= error; },
    );
    const favorites = operations.loadFavorites().catch((error: unknown) => {
      sourceError ??= error;
    });
    const initialDishes = operations.loadInitialDishes();
    const [, , dishResult] = await Promise.all([categories, favorites, initialDishes]);

    if (requestId !== bootstrapGeneration) return { status: "stale" };
    if (sourceError !== undefined) {
      retryRegistration = {
        source: "bootstrap",
        run: () => runBootstrap(operations),
      };
      operations.fail(sourceError);
      return { status: "failed", error: sourceError };
    }
    clearRetry("bootstrap");
    if (operations.currentFilter() === "favorites") {
      return operations.reloadFavorites();
    }
    return dishResult;
  };

  const runRefresh = async (operations: RefreshOperations): Promise<SelectLoadResult> => {
    refreshGeneration += 1;
    const ownerId = refreshGeneration;
    operations.start();
    try {
      const result = await operations.run();
      if (ownerId !== refreshGeneration || result.status === "stale") return { status: "stale" };
      if (result.status === "failed") {
        retryRegistration = {
          source: "refresh",
          run: () => runRefresh(operations),
        };
        operations.fail(result.error);
        return result;
      }
      clearRetry("refresh");
      operations.succeed();
      return result;
    } catch (error) {
      if (ownerId !== refreshGeneration) return { status: "stale" };
      retryRegistration = {
        source: "refresh",
        run: () => runRefresh(operations),
      };
      operations.fail(error);
      return { status: "failed", error };
    } finally {
      operations.stop();
    }
  };

  return {
    runDish,
    runBootstrap,
    runRefresh,
    cancelRefresh,
    retrySource() {
      return retryRegistration?.source ?? null;
    },
    retry() {
      return retryRegistration?.run() ?? Promise.resolve({ status: "stale" });
    },
    invalidate() {
      dishGeneration += 1;
      bootstrapGeneration += 1;
      refreshGeneration += 1;
      retryRegistration = undefined;
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
