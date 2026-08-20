import "server-only";

import type {
  FavoriteMutationDto,
  FavoriteSearchDto,
  PublicDishDto,
} from "@ordering/contracts";

import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";
import {
  PUBLIC_DISH_WHERE,
  toPublicDishDto,
} from "../menu/menu-query";

export async function addFavorite(
  userId: string,
  dishId: string,
): Promise<FavoriteMutationDto> {
  const dish = await prisma.dish.findFirst({
    where: { AND: [PUBLIC_DISH_WHERE, { id: dishId }] },
    select: { id: true },
  });
  if (!dish) {
    throw new ApiError("NOT_FOUND", "菜品不存在或当前不可用", 404);
  }

  await prisma.favorite.upsert({
    where: { userId_dishId: { dishId, userId } },
    create: { dishId, userId },
    update: {},
  });
  return { dishId, favorited: true };
}

export async function removeFavorite(
  userId: string,
  dishId: string,
): Promise<FavoriteMutationDto> {
  await prisma.favorite.deleteMany({ where: { dishId, userId } });
  return { dishId, favorited: false };
}

export async function listFavorites(
  userId: string,
  input: FavoriteSearchDto,
): Promise<{ items: PublicDishDto[]; nextCursor: string | null }> {
  if (input.cursor) {
    const ownedCursor = await prisma.favorite.findFirst({
      where: { id: input.cursor, userId },
      select: { id: true },
    });
    if (!ownedCursor) {
      throw new ApiError("VALIDATION_ERROR", "分页游标无效", 400);
    }
  }

  const rows = await prisma.favorite.findMany({
    where: { dish: { is: PUBLIC_DISH_WHERE }, userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      dish: {
        select: {
          categoryId: true,
          description: true,
          id: true,
          imageUpload: { select: { storageKey: true } },
          name: true,
          priceCents: true,
          sortOrder: true,
        },
      },
      id: true,
    },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return {
    items: page.map((favorite) => toPublicDishDto(favorite.dish)),
    nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
  };
}
