import { z } from "zod";

export const ResourceId = z.cuid();

export const CategoryInput = z
  .object({
    name: z.string().trim().min(1).max(20),
    sortOrder: z.number().int().min(0).max(9_999),
    enabled: z.boolean(),
  })
  .strict();

export const CategoryUpdateInput = CategoryInput.extend({
  expectedUpdatedAt: z.iso.datetime(),
});

export const OptimisticDeleteInput = z
  .object({ expectedUpdatedAt: z.iso.datetime() })
  .strict();

export const DishSearch = z
  .object({
    q: z.string().trim().max(40).default(""),
    categoryId: ResourceId.optional(),
    cursor: ResourceId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const DishAvailabilityRequest = z
  .object({
    dishIds: z
      .array(ResourceId)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "dishIds must be unique",
      }),
  })
  .strict();

export const AdminCategorySearch = z
  .object({
    cursor: ResourceId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    includeDeleted: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();

export type CategoryInputDto = z.infer<typeof CategoryInput>;
export type CategoryUpdateDto = z.infer<typeof CategoryUpdateInput>;
export type OptimisticDeleteDto = z.infer<typeof OptimisticDeleteInput>;
export type DishSearchDto = z.infer<typeof DishSearch>;
export type AdminCategorySearchDto = z.infer<typeof AdminCategorySearch>;

export type PublicCategoryDto = {
  id: string;
  name: string;
  sortOrder: number;
};

export type PublicDishDto = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string;
  referencePriceCents: number;
  sortOrder: number;
};

export type DishAvailabilityDto =
  | { dishId: string; available: false }
  | { dishId: string; available: true; dish: PublicDishDto };

export type AdminCategoryDto = {
  id: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  dishCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
