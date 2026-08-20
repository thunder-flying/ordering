export const MAX_LIST_TOTAL_CENTS = 989_999_901;

type PricedListItem = {
  dishId: string;
  priceCents: number;
  quantity: number;
};

export function calculateListTotal(items: PricedListItem[]): number {
  const seenDishIds = new Set<string>();
  let totalCents = 0;

  for (const item of items) {
    if (seenDishIds.has(item.dishId)) {
      throw new Error("duplicate dishId in saved list");
    }
    seenDishIds.add(item.dishId);

    if (
      !Number.isSafeInteger(item.priceCents) ||
      item.priceCents < 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99
    ) {
      throw new Error("invalid list item price or quantity");
    }

    totalCents += item.priceCents * item.quantity;
    if (!Number.isSafeInteger(totalCents) || totalCents > MAX_LIST_TOTAL_CENTS) {
      throw new Error("saved list total exceeds the supported limit");
    }
  }

  return totalCents;
}
