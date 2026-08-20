import "server-only";

import type {
  DishAvailabilityDto,
  DishSearchDto,
  PublicCategoryDto,
  PublicDishDto,
} from "@ordering/contracts";

import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";

export const PUBLIC_DISH_WHERE = {
  category: { is: { deletedAt: null, enabled: true } },
  deletedAt: null,
  imageUpload: { is: { referenceState: "REFERENCED" as const } },
  published: true,
};

function imageUrl(storageKey: string): string {
  return `/media/dishes/${encodeURIComponent(storageKey)}`;
}

export function toPublicDishDto(dish: {
  categoryId: string;
  description: string;
  id: string;
  imageUpload: { storageKey: string } | null;
  name: string;
  priceCents: number;
  sortOrder: number;
}): PublicDishDto {
  if (!dish.imageUpload) {
    throw new Error("A public dish must have a referenced image");
  }

  return {
    categoryId: dish.categoryId,
    description: dish.description,
    id: dish.id,
    imageUrl: imageUrl(dish.imageUpload.storageKey),
    name: dish.name,
    referencePriceCents: dish.priceCents,
    sortOrder: dish.sortOrder,
  };
}

export async function listPublicCategories(): Promise<PublicCategoryDto[]> {
  return prisma.category.findMany({
    where: { deletedAt: null, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, sortOrder: true },
  });
}

export async function searchPublicDishes(input: DishSearchDto): Promise<{
  items: PublicDishDto[];
  nextCursor: string | null;
}> {
  const cursorDish = input.cursor
    ? await prisma.dish.findUnique({
        where: { id: input.cursor },
        select: {
          category: { select: { sortOrder: true } },
          id: true,
          sortOrder: true,
        },
      })
    : null;

  if (input.cursor && !cursorDish) {
    throw new ApiError("VALIDATION_ERROR", "分页游标无效", 400);
  }

  const afterCursor = cursorDish
    ? {
        OR: [
          { category: { is: { sortOrder: { gt: cursorDish.category.sortOrder } } } },
          {
            AND: [
              { category: { is: { sortOrder: cursorDish.category.sortOrder } } },
              { sortOrder: { gt: cursorDish.sortOrder } },
            ],
          },
          {
            AND: [
              { category: { is: { sortOrder: cursorDish.category.sortOrder } } },
              { sortOrder: cursorDish.sortOrder },
              { id: { gt: cursorDish.id } },
            ],
          },
        ],
      }
    : {};

  const rows = await prisma.dish.findMany({
    where: {
      AND: [
        PUBLIC_DISH_WHERE,
        afterCursor,
        input.categoryId ? { categoryId: input.categoryId } : {},
        input.q ? { name: { contains: input.q } } : {},
      ],
    },
    orderBy: [
      { category: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { id: "asc" },
    ],
    select: {
      categoryId: true,
      description: true,
      id: true,
      imageUpload: { select: { storageKey: true } },
      name: true,
      priceCents: true,
      sortOrder: true,
    },
    take: input.limit + 1,
  });
  const hasNextPage = rows.length > input.limit;
  const page = rows.slice(0, input.limit).map(toPublicDishDto);

  return {
    items: page,
    nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function resolveDishAvailability(
  dishIds: string[],
): Promise<DishAvailabilityDto[]> {
  const rows = await prisma.dish.findMany({
    where: { AND: [PUBLIC_DISH_WHERE, { id: { in: dishIds } }] },
    select: {
      categoryId: true,
      description: true,
      id: true,
      imageUpload: { select: { storageKey: true } },
      name: true,
      priceCents: true,
      sortOrder: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, toPublicDishDto(row)]));

  return dishIds.map((dishId) => {
    const dish = byId.get(dishId);
    return dish
      ? { available: true as const, dish, dishId }
      : { available: false as const, dishId };
  });
}
