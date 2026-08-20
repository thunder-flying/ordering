import { z } from "zod";

import { ResourceId } from "./menu";

const ListItemInput = z
  .object({
    dishId: ResourceId,
    quantity: z.number().int().min(1).max(99),
    note: z.string().trim().max(100),
  })
  .strict();

export const SaveListInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    idempotencyKey: z.uuid(),
    items: z
      .array(ListItemInput)
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items.map((item) => item.dishId)).size === items.length,
        { message: "dishId must be unique within a list" },
      ),
  })
  .strict();

export const UpdateListInput = SaveListInput.extend({
  expectedUpdatedAt: z.iso.datetime(),
});

export const CopyListInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    idempotencyKey: z.uuid(),
  })
  .strict();

export const SavedListSearch = z
  .object({
    cursor: ResourceId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type SaveListDto = z.infer<typeof SaveListInput>;
export type UpdateListDto = z.infer<typeof UpdateListInput>;
export type CopyListDto = z.infer<typeof CopyListInput>;
export type SavedListSearchDto = z.infer<typeof SavedListSearch>;

export type SavedListSummaryDto = {
  id: string;
  name: string;
  itemCount: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedListItemDto = {
  dishId: string | null;
  nameSnapshot: string;
  referencePriceCentsSnapshot: number;
  quantity: number;
  note: string;
  position: number;
  currentlyAvailable: boolean;
};

export type SavedListDetailDto = SavedListSummaryDto & {
  items: SavedListItemDto[];
};

export type CopyListResultDto = {
  list: SavedListDetailDto;
  skippedItemNames: string[];
};
