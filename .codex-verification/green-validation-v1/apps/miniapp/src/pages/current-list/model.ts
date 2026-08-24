import type { DishAvailabilityDto, SavedListDetailDto, SaveListDto, UpdateListDto } from "@ordering/contracts";

import { ClientError } from "../../api/request";
import type { Draft, DraftItem } from "../../state/draft";

type WritableItem = { dishId: string; quantity: number; note: string };
export type CreateListInput = Omit<SaveListDto, "items"> & { items: WritableItem[] };
export type UpdateListInput = Omit<UpdateListDto, "items"> & { items: WritableItem[] };
export type AvailableDraftItem = DraftItem & { available: boolean };

export type SaveOperation =
  | { kind: "create"; input: CreateListInput }
  | { kind: "update"; listId: string; input: UpdateListInput };

export type CurrentListSaveResult =
  | { status: "saved"; list: SavedListDetailDto }
  | { status: "conflict"; recoverable: true; error: ClientError }
  | { status: "failed"; error: unknown };

export function mergeDraftAvailability(
  items: readonly DraftItem[],
  availability: readonly DishAvailabilityDto[],
): { items: AvailableDraftItem[]; unavailableNames: string[] } {
  const byId = new Map(availability.map((item) => [item.dishId, item]));
  const merged = items.map((item): AvailableDraftItem => {
    const current = byId.get(item.dishId);
    if (!current?.available) return { ...item, available: false };
    return {
      ...item,
      imageUrl: current.dish.imageUrl || null,
      referencePriceCents: current.dish.referencePriceCents,
      available: true,
    };
  });
  return {
    items: merged,
    unavailableNames: merged.filter((item) => !item.available).map((item) => item.name),
  };
}

function writableItems(items: readonly DraftItem[]): WritableItem[] {
  return items.map((item) => ({
    dishId: item.dishId,
    quantity: item.quantity,
    note: item.note.trim(),
  }));
}

export function buildSaveOperation(draft: Draft): SaveOperation {
  const base = {
    name: draft.name.trim(),
    idempotencyKey: draft.mutationKey,
    items: writableItems(draft.items),
  };
  if (!draft.editTarget) return { kind: "create", input: base };
  return {
    kind: "update",
    listId: draft.editTarget.listId,
    input: { ...base, expectedUpdatedAt: draft.editTarget.expectedUpdatedAt },
  };
}

export function createCurrentListSaveController(dependencies: {
  getDraft(): Draft;
  create(input: CreateListInput): Promise<SavedListDetailDto>;
  update(listId: string, input: UpdateListInput): Promise<SavedListDetailDto>;
  clearDraft(): void;
}): { save(): Promise<CurrentListSaveResult>; isPending(): boolean } {
  let pending: Promise<CurrentListSaveResult> | null = null;

  function run(): Promise<CurrentListSaveResult> {
    return (async () => {
      try {
        const operation = buildSaveOperation(dependencies.getDraft());
        const list = operation.kind === "create"
          ? await dependencies.create(operation.input)
          : await dependencies.update(operation.listId, operation.input);
        dependencies.clearDraft();
        return { status: "saved", list };
      } catch (error) {
        if (error instanceof ClientError && error.status === 409) {
          return { status: "conflict", recoverable: true, error };
        }
        return { status: "failed", error };
      } finally {
        pending = null;
      }
    })();
  }

  return {
    save() {
      pending ??= run();
      return pending;
    },
    isPending: () => pending !== null,
  };
}
