import { z } from "zod";

import { ResourceId } from "./menu";

export const FavoriteSearch = z
  .object({
    cursor: ResourceId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type FavoriteSearchDto = z.infer<typeof FavoriteSearch>;
export type FavoriteMutationDto = {
  dishId: string;
  favorited: boolean;
};
