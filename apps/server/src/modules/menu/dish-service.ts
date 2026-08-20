import "server-only";

import type {
  AdminDishDto,
  AdminDishSearchDto,
  DishInputDto,
  DishUpdateDto,
} from "@ordering/contracts";

import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";

const IMAGE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;

const adminDishSelect = {
  category: { select: { name: true } },
  categoryId: true,
  createdAt: true,
  deletedAt: true,
  description: true,
  id: true,
  imageUpload: { select: { storageKey: true } },
  imageUploadId: true,
  name: true,
  priceCents: true,
  published: true,
  sortOrder: true,
  updatedAt: true,
} as const;

function toAdminDish(dish: {
  category: { name: string };
  categoryId: string;
  createdAt: Date;
  deletedAt: Date | null;
  description: string;
  id: string;
  imageUpload: { storageKey: string } | null;
  imageUploadId: string | null;
  name: string;
  priceCents: number;
  published: boolean;
  sortOrder: number;
  updatedAt: Date;
}): AdminDishDto {
  if (!dish.imageUpload || !dish.imageUploadId) {
    throw new Error("An administered dish must have an image");
  }
  return {
    categoryId: dish.categoryId,
    categoryName: dish.category.name,
    createdAt: dish.createdAt.toISOString(),
    deletedAt: dish.deletedAt?.toISOString() ?? null,
    description: dish.description,
    id: dish.id,
    imageUploadId: dish.imageUploadId,
    imageUrl: `/media/dishes/${encodeURIComponent(dish.imageUpload.storageKey)}`,
    name: dish.name,
    published: dish.published,
    referencePriceCents: dish.priceCents,
    sortOrder: dish.sortOrder,
    updatedAt: dish.updatedAt.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", "菜品不存在", 404);
}

function conflict(message = "菜品已被其他操作更新，请刷新后重试"): ApiError {
  return new ApiError("CONFLICT", message, 409);
}

async function assertCategoryAndNameAvailable(
  transaction: Prisma.TransactionClient,
  categoryId: string,
  name: string,
  excludedDishId?: string,
) {
  const category = await transaction.category.findFirst({
    where: { deletedAt: null, id: categoryId },
    select: { id: true },
  });
  if (!category) {
    throw new ApiError("CONFLICT", "所选分类不存在或已删除", 409);
  }

  const duplicate = await transaction.dish.findFirst({
    where: {
      categoryId,
      deletedAt: null,
      name,
      ...(excludedDishId ? { id: { not: excludedDishId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict("同一分类下已有同名菜品");
  }
}

async function claimUpload(
  transaction: Prisma.TransactionClient,
  uploadId: string,
) {
  const claimed = await transaction.upload.updateMany({
    where: {
      id: uploadId,
      pendingDeleteAt: null,
      purpose: "DISH_IMAGE",
      referenceState: "UNREFERENCED",
    },
    data: { referenceState: "REFERENCED" },
  });
  if (claimed.count !== 1) {
    throw conflict("图片不存在或已被其他菜品使用");
  }
}

export async function createDish(input: DishInputDto): Promise<AdminDishDto> {
  return prisma.$transaction(
    async (transaction) => {
      await assertCategoryAndNameAvailable(
        transaction,
        input.categoryId,
        input.name,
      );
      await claimUpload(transaction, input.imageUploadId);

      const dish = await transaction.dish.create({
        data: {
          categoryId: input.categoryId,
          description: input.description,
          imageUploadId: input.imageUploadId,
          name: input.name,
          priceCents: input.referencePriceCents,
          published: input.published,
          sortOrder: input.sortOrder,
        },
        select: adminDishSelect,
      });
      return toAdminDish(dish);
    },
    { isolationLevel: "Serializable" },
  );
}

export async function updateDish(
  id: string,
  input: DishUpdateDto,
): Promise<AdminDishDto> {
  return prisma.$transaction(
    async (transaction) => {
      const current = await transaction.dish.findUnique({
        where: { id },
        select: { deletedAt: true, imageUploadId: true, updatedAt: true },
      });
      if (!current || current.deletedAt) {
        throw notFound();
      }
      if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw conflict();
      }

      await assertCategoryAndNameAvailable(
        transaction,
        input.categoryId,
        input.name,
        id,
      );
      const imageChanged = current.imageUploadId !== input.imageUploadId;
      if (imageChanged) {
        await claimUpload(transaction, input.imageUploadId);
      }

      const updated = await transaction.dish.updateMany({
        where: { deletedAt: null, id, updatedAt: current.updatedAt },
        data: {
          categoryId: input.categoryId,
          description: input.description,
          imageUploadId: input.imageUploadId,
          name: input.name,
          priceCents: input.referencePriceCents,
          published: input.published,
          sortOrder: input.sortOrder,
        },
      });
      if (updated.count !== 1) {
        throw conflict();
      }

      if (imageChanged && current.imageUploadId) {
        await transaction.upload.updateMany({
          where: { id: current.imageUploadId, referenceState: "REFERENCED" },
          data: {
            pendingDeleteAt: new Date(Date.now() + IMAGE_GRACE_PERIOD_MS),
            referenceState: "PENDING_DELETE",
          },
        });
      }

      return toAdminDish(
        await transaction.dish.findUniqueOrThrow({
          where: { id },
          select: adminDishSelect,
        }),
      );
    },
    { isolationLevel: "Serializable" },
  );
}

export async function softDeleteDish(
  id: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const current = await prisma.dish.findUnique({
    where: { id },
    select: { deletedAt: true, updatedAt: true },
  });
  if (!current || current.deletedAt) {
    throw notFound();
  }
  if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw conflict();
  }

  const deleted = await prisma.dish.updateMany({
    where: { deletedAt: null, id, updatedAt: current.updatedAt },
    data: { deletedAt: new Date(), published: false },
  });
  if (deleted.count !== 1) {
    throw conflict();
  }
}

export async function listAdminDishes(
  input: AdminDishSearchDto,
): Promise<{ items: AdminDishDto[]; nextCursor: string | null }> {
  const rows = await prisma.dish.findMany({
    where: {
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.q ? { name: { contains: input.q } } : {}),
      ...(input.published === undefined ? {} : { published: input.published }),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: adminDishSelect,
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map(toAdminDish);
  return {
    items,
    nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
  };
}
