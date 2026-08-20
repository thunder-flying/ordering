import "server-only";

import type {
  AdminCategoryDto,
  AdminCategorySearchDto,
  CategoryInputDto,
  CategoryUpdateDto,
} from "@ordering/contracts";

import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";

const adminCategorySelect = {
  _count: { select: { dishes: { where: { deletedAt: null } } } },
  createdAt: true,
  deletedAt: true,
  enabled: true,
  id: true,
  name: true,
  sortOrder: true,
  updatedAt: true,
} as const;

function toAdminCategory(category: {
  _count: { dishes: number };
  createdAt: Date;
  deletedAt: Date | null;
  enabled: boolean;
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: Date;
}): AdminCategoryDto {
  return {
    createdAt: category.createdAt.toISOString(),
    deletedAt: category.deletedAt?.toISOString() ?? null,
    dishCount: category._count.dishes,
    enabled: category.enabled,
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    updatedAt: category.updatedAt.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", "分类不存在", 404);
}

function conflict(message = "分类已被其他操作更新，请刷新后重试"): ApiError {
  return new ApiError("CONFLICT", message, 409);
}

export async function createCategory(
  input: CategoryInputDto,
): Promise<AdminCategoryDto> {
  return prisma.$transaction(
    async (transaction) => {
      const duplicate = await transaction.category.findFirst({
        where: { deletedAt: null, name: input.name },
        select: { id: true },
      });
      if (duplicate) {
        throw conflict("已有同名分类");
      }

      const category = await transaction.category.create({
        data: input,
        select: adminCategorySelect,
      });
      return toAdminCategory(category);
    },
    { isolationLevel: "Serializable" },
  );
}

export async function updateCategory(
  id: string,
  input: CategoryUpdateDto,
): Promise<AdminCategoryDto> {
  return prisma.$transaction(
    async (transaction) => {
      const current = await transaction.category.findUnique({
        where: { id },
        select: { deletedAt: true, updatedAt: true },
      });
      if (!current || current.deletedAt) {
        throw notFound();
      }
      if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw conflict();
      }

      const duplicate = await transaction.category.findFirst({
        where: { deletedAt: null, id: { not: id }, name: input.name },
        select: { id: true },
      });
      if (duplicate) {
        throw conflict("已有同名分类");
      }

      const updated = await transaction.category.updateMany({
        where: { deletedAt: null, id, updatedAt: current.updatedAt },
        data: {
          enabled: input.enabled,
          name: input.name,
          sortOrder: input.sortOrder,
        },
      });
      if (updated.count !== 1) {
        throw conflict();
      }

      return toAdminCategory(
        await transaction.category.findUniqueOrThrow({
          where: { id },
          select: adminCategorySelect,
        }),
      );
    },
    { isolationLevel: "Serializable" },
  );
}

export async function softDeleteCategory(
  id: string,
  expectedUpdatedAt: string,
): Promise<void> {
  await prisma.$transaction(
    async (transaction) => {
      const current = await transaction.category.findUnique({
        where: { id },
        select: { deletedAt: true, updatedAt: true },
      });
      if (!current || current.deletedAt) {
        throw notFound();
      }
      if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw conflict();
      }

      const dishCount = await transaction.dish.count({
        where: { categoryId: id, deletedAt: null },
      });
      if (dishCount > 0) {
        throw conflict("分类下仍有菜品，无法删除");
      }

      const deleted = await transaction.category.updateMany({
        where: { deletedAt: null, id, updatedAt: current.updatedAt },
        data: { deletedAt: new Date(), enabled: false },
      });
      if (deleted.count !== 1) {
        throw conflict();
      }
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listAdminCategories(
  input: AdminCategorySearchDto,
): Promise<{ items: AdminCategoryDto[]; nextCursor: string | null }> {
  const cursorCategory = input.cursor
    ? await prisma.category.findUnique({
        where: { id: input.cursor },
        select: { id: true, sortOrder: true },
      })
    : null;
  if (input.cursor && !cursorCategory) {
    throw new ApiError("VALIDATION_ERROR", "分页游标无效", 400);
  }

  const rows = await prisma.category.findMany({
    where: {
      AND: [
        input.includeDeleted ? {} : { deletedAt: null },
        cursorCategory
          ? {
              OR: [
                { sortOrder: { gt: cursorCategory.sortOrder } },
                {
                  sortOrder: cursorCategory.sortOrder,
                  id: { gt: cursorCategory.id },
                },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: adminCategorySelect,
    take: input.limit + 1,
  });
  const hasNextPage = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map(toAdminCategory);

  return {
    items,
    nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
  };
}
