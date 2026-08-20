import { z } from "zod";

import { ResourceId } from "./menu";

export const DishInput = z
  .object({
    categoryId: ResourceId,
    name: z.string().trim().min(1).max(40),
    description: z.string().trim().max(300),
    referencePriceCents: z.number().int().min(0).max(9_999_999),
    imageUploadId: ResourceId,
    sortOrder: z.number().int().min(0).max(9_999),
    published: z.boolean(),
  })
  .strict();

export const DishUpdateInput = DishInput.extend({
  expectedUpdatedAt: z.iso.datetime(),
});

export const AdminDishSearch = z
  .object({
    q: z.string().trim().max(40).default(""),
    categoryId: ResourceId.optional(),
    cursor: ResourceId.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    published: z
      .enum(["true", "false"])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === "true",
      ),
    includeDeleted: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();

export type DishInputDto = z.infer<typeof DishInput>;
export type DishUpdateDto = z.infer<typeof DishUpdateInput>;
export type AdminDishSearchDto = z.infer<typeof AdminDishSearch>;

export type AdminDishDto = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  referencePriceCents: number;
  imageUrl: string;
  imageUploadId: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type UploadDto = {
  id: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  bytes: number;
  previewUrl: string;
};
