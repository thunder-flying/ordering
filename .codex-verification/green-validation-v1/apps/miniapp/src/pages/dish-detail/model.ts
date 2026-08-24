import type { DishAvailabilityDto, PublicDishDto } from "@ordering/contracts";

import { formatCents } from "../../utils/price";

export type DishDetailView = PublicDishDto & {
  priceText: string;
  favorited: boolean;
};

export type DishDetailPresentation =
  | { status: "ready"; dish: DishDetailView }
  | { status: "unavailable" }
  | { status: "error"; errorMessage: string };

export type DishDetailLoadState = {
  status: "loading" | "ready" | "unavailable" | "error";
  dish: DishDetailView | null;
  errorMessage: string;
  imageFailed: boolean;
};

const MALFORMED_AVAILABILITY_MESSAGE = "菜品信息暂时不完整，请重新加载。";

export function presentDishDetail(
  dishId: string,
  items: readonly DishAvailabilityDto[],
  favoriteIds: ReadonlySet<string>,
): DishDetailPresentation {
  const matched = items.find((item) => item.dishId === dishId);
  if (!matched) return { status: "error", errorMessage: MALFORMED_AVAILABILITY_MESSAGE };
  if (!matched.available) return { status: "unavailable" };

  return {
    status: "ready",
    dish: {
      ...matched.dish,
      priceText: formatCents(matched.dish.referencePriceCents),
      favorited: favoriteIds.has(dishId),
    },
  };
}

function stateFor(presentation: DishDetailPresentation): DishDetailLoadState {
  if (presentation.status === "ready") {
    return { status: "ready", dish: presentation.dish, errorMessage: "", imageFailed: false };
  }
  if (presentation.status === "error") {
    return { status: "error", dish: null, errorMessage: presentation.errorMessage, imageFailed: false };
  }
  return { status: "unavailable", dish: null, errorMessage: "", imageFailed: false };
}

export function createDishDetailLoader(operations: {
  load(dishId: string): Promise<DishDetailPresentation>;
  apply(state: DishDetailLoadState): void;
  formatError(error: unknown): string;
}): {
  load(dishId: string): Promise<void>;
  invalidate(): void;
} {
  let latest = 0;
  return {
    async load(dishId) {
      latest += 1;
      const requestId = latest;
      operations.apply({ status: "loading", dish: null, errorMessage: "", imageFailed: false });
      try {
        const presentation = await operations.load(dishId);
        if (requestId !== latest) return;
        operations.apply(stateFor(presentation));
      } catch (error) {
        if (requestId !== latest) return;
        operations.apply({
          status: "error",
          dish: null,
          errorMessage: operations.formatError(error),
          imageFailed: false,
        });
      }
    },
    invalidate() {
      latest += 1;
    },
  };
}
