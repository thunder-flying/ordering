import type { DishAvailabilityDto, PublicDishDto } from "@ordering/contracts";

import { formatCents } from "../../utils/price";

export type DishDetailView = PublicDishDto & {
  priceText: string;
  favorited: boolean;
};

export type DishDetailPresentation =
  | { status: "ready"; dish: DishDetailView }
  | { status: "unavailable" }
  | { status: "error" };

export function presentDishDetail(
  dishId: string,
  items: readonly DishAvailabilityDto[],
  favoriteIds: ReadonlySet<string>,
): DishDetailPresentation {
  const matched = items.find((item) => item.dishId === dishId);
  if (!matched) return { status: "error" };
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
