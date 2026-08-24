import type { SavedListDetailDto } from "@ordering/contracts";

import type { Draft } from "../state/draft";

export type EditableDraft = Omit<Draft, "version" | "mutationKey" | "updatedAt">;

export function buildEditableDraft(detail: SavedListDetailDto): {
  draft: EditableDraft;
  skippedItemNames: string[];
} {
  const editable = detail.items
    .filter((item): item is typeof item & { dishId: string } => (
      item.currentlyAvailable && typeof item.dishId === "string" && item.dishId.length > 0
    ))
    .sort((left, right) => left.position - right.position);
  const skipped = detail.items
    .filter((item) => !item.currentlyAvailable || !item.dishId)
    .sort((left, right) => left.position - right.position)
    .map((item) => item.nameSnapshot);

  return {
    draft: {
      name: detail.name,
      items: editable.map((item) => ({
        dishId: item.dishId,
        name: item.nameSnapshot,
        imageUrl: null,
        referencePriceCents: item.referencePriceCentsSnapshot,
        quantity: item.quantity,
        note: item.note,
      })),
      editTarget: {
        listId: detail.id,
        expectedUpdatedAt: detail.updatedAt,
      },
    },
    skippedItemNames: skipped,
  };
}
