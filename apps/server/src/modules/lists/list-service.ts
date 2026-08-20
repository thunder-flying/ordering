import "server-only";

import type {
  CopyListDto,
  CopyListResultDto,
  SavedListDetailDto,
  SavedListSearchDto,
  SavedListSummaryDto,
  SaveListDto,
  UpdateListDto,
} from "@ordering/contracts";

import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";
import { PUBLIC_DISH_WHERE } from "../menu/menu-query";
import { calculateListTotal } from "./list-calculator";

const DETAIL_SELECT = {
  _count: { select: { items: true } },
  createdAt: true,
  id: true,
  items: {
    orderBy: { position: "asc" as const },
    select: {
      dish: {
        select: {
          category: { select: { deletedAt: true, enabled: true } },
          deletedAt: true,
          imageUpload: { select: { referenceState: true } },
          published: true,
        },
      },
      dishId: true,
      dishNameSnapshot: true,
      note: true,
      position: true,
      priceCentsSnapshot: true,
      quantity: true,
    },
  },
  name: true,
  totalCents: true,
  updatedAt: true,
} as const;

async function findOwnedListRow(userId: string, listId: string) {
  return prisma.savedList.findFirst({
    where: { id: listId, userId },
    select: DETAIL_SELECT,
  });
}

type OwnedListRow = NonNullable<Awaited<ReturnType<typeof findOwnedListRow>>>;

function isCurrentlyAvailable(item: OwnedListRow["items"][number]): boolean {
  const dish = item.dish;
  return Boolean(
    dish &&
      dish.published &&
      dish.deletedAt === null &&
      dish.category.enabled &&
      dish.category.deletedAt === null &&
      dish.imageUpload?.referenceState === "REFERENCED",
  );
}

function toDetailDto(row: OwnedListRow): SavedListDetailDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    itemCount: row._count.items,
    items: row.items.map((item) => ({
      currentlyAvailable: isCurrentlyAvailable(item),
      dishId: item.dishId,
      nameSnapshot: item.dishNameSnapshot,
      note: item.note,
      position: item.position,
      quantity: item.quantity,
      referencePriceCentsSnapshot: item.priceCentsSnapshot,
    })),
    name: row.name,
    totalCents: row.totalCents,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function availableSnapshotItems(
  tx: Prisma.TransactionClient,
  items: SaveListDto["items"],
) {
  const dishes = await tx.dish.findMany({
    where: {
      AND: [PUBLIC_DISH_WHERE, { id: { in: items.map((item) => item.dishId) } }],
    },
    select: { id: true, name: true, priceCents: true },
  });
  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));

  if (dishesById.size !== items.length) {
    throw new ApiError("NOT_FOUND", "部分菜品不存在或当前不可用", 404);
  }

  const snapshots = items.map((item, position) => {
    const dish = dishesById.get(item.dishId);
    if (!dish) {
      throw new ApiError("NOT_FOUND", "部分菜品不存在或当前不可用", 404);
    }
    return {
      dishId: dish.id,
      dishNameSnapshot: dish.name,
      note: item.note,
      position,
      priceCentsSnapshot: dish.priceCents,
      quantity: item.quantity,
    };
  });

  try {
    return {
      snapshots,
      totalCents: calculateListTotal(
        snapshots.map((item) => ({
          dishId: item.dishId,
          priceCents: item.priceCentsSnapshot,
          quantity: item.quantity,
        })),
      ),
    };
  } catch {
    throw new ApiError("VALIDATION_ERROR", "清单合计超出允许范围", 400);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function getByIdempotencyKey(userId: string, idempotencyKey: string) {
  return prisma.savedList.findUnique({
    where: { userId_idempotencyKey: { idempotencyKey, userId } },
    select: { id: true },
  });
}

export async function createList(
  userId: string,
  input: SaveListDto,
): Promise<SavedListDetailDto> {
  const existing = await getByIdempotencyKey(userId, input.idempotencyKey);
  if (existing) {
    return getList(userId, existing.id);
  }

  let listId: string;
  try {
    listId = await prisma.$transaction(async (tx) => {
      const retry = await tx.savedList.findUnique({
        where: {
          userId_idempotencyKey: {
            idempotencyKey: input.idempotencyKey,
            userId,
          },
        },
        select: { id: true },
      });
      if (retry) return retry.id;

      const { snapshots, totalCents } = await availableSnapshotItems(tx, input.items);
      const created = await tx.savedList.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          items: { createMany: { data: snapshots } },
          name: input.name,
          totalCents,
          userId,
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const retry = await getByIdempotencyKey(userId, input.idempotencyKey);
    if (!retry) throw error;
    listId = retry.id;
  }

  return getList(userId, listId);
}

export async function getList(
  userId: string,
  listId: string,
): Promise<SavedListDetailDto> {
  const row = await findOwnedListRow(userId, listId);
  if (!row) {
    throw new ApiError("NOT_FOUND", "清单不存在", 404);
  }
  return toDetailDto(row);
}

export async function listLists(
  userId: string,
  input: SavedListSearchDto,
): Promise<{ items: SavedListSummaryDto[]; nextCursor: string | null }> {
  if (input.cursor) {
    const cursor = await prisma.savedList.findFirst({
      where: { id: input.cursor, userId },
      select: { id: true },
    });
    if (!cursor) {
      throw new ApiError("VALIDATION_ERROR", "分页游标无效", 400);
    }
  }

  const rows = await prisma.savedList.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      _count: { select: { items: true } },
      createdAt: true,
      id: true,
      name: true,
      totalCents: true,
      updatedAt: true,
    },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return {
    items: page.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      itemCount: row._count.items,
      name: row.name,
      totalCents: row.totalCents,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function updateList(
  userId: string,
  listId: string,
  input: UpdateListDto,
): Promise<SavedListDetailDto> {
  await prisma.$transaction(async (tx) => {
    const owned = await tx.savedList.findFirst({
      where: { id: listId, userId },
      select: { idempotencyKey: true, updatedAt: true },
    });
    if (!owned) {
      throw new ApiError("NOT_FOUND", "清单不存在", 404);
    }
    if (owned.idempotencyKey === input.idempotencyKey) return;

    const reusedKey = await tx.savedList.findUnique({
      where: {
        userId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          userId,
        },
      },
      select: { id: true },
    });
    if (reusedKey) {
      throw new ApiError("CONFLICT", "幂等键已用于其他清单", 409);
    }
    if (owned.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
      throw new ApiError("CONFLICT", "清单已被修改，请刷新后重试", 409);
    }

    const { snapshots, totalCents } = await availableSnapshotItems(tx, input.items);
    const updated = await tx.savedList.updateMany({
      where: { id: listId, updatedAt: owned.updatedAt, userId },
      data: {
        idempotencyKey: input.idempotencyKey,
        name: input.name,
        totalCents,
        updatedAt: new Date(Math.max(Date.now(), owned.updatedAt.getTime() + 1)),
      },
    });
    if (updated.count !== 1) {
      throw new ApiError("CONFLICT", "清单已被修改，请刷新后重试", 409);
    }
    await tx.listItem.deleteMany({ where: { savedListId: listId } });
    await tx.listItem.createMany({
      data: snapshots.map((item) => ({ ...item, savedListId: listId })),
    });
  });

  return getList(userId, listId);
}

export async function copyList(
  userId: string,
  sourceListId: string,
  input: CopyListDto,
): Promise<CopyListResultDto> {
  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.savedList.findFirst({
      where: { id: sourceListId, userId },
      select: {
        items: {
          orderBy: { position: "asc" },
          select: {
            dishId: true,
            dishNameSnapshot: true,
            note: true,
            quantity: true,
          },
        },
      },
    });
    if (!source) {
      throw new ApiError("NOT_FOUND", "清单不存在", 404);
    }

    const dishIds = source.items.flatMap((item) =>
      item.dishId ? [item.dishId] : [],
    );
    const dishes = await tx.dish.findMany({
      where: { AND: [PUBLIC_DISH_WHERE, { id: { in: dishIds } }] },
      select: { id: true, name: true, priceCents: true },
    });
    const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));
    const skippedItemNames = source.items
      .filter((item) => !item.dishId || !dishesById.has(item.dishId))
      .map((item) => item.dishNameSnapshot);

    const retry = await tx.savedList.findUnique({
      where: {
        userId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          userId,
        },
      },
      select: { id: true },
    });
    if (retry) return { listId: retry.id, skippedItemNames };

    const snapshots = source.items.flatMap((item) => {
      const dish = item.dishId ? dishesById.get(item.dishId) : undefined;
      return dish
        ? [
            {
              dishId: dish.id,
              dishNameSnapshot: dish.name,
              note: item.note,
              position: 0,
              priceCentsSnapshot: dish.priceCents,
              quantity: item.quantity,
            },
          ]
        : [];
    });
    snapshots.forEach((item, position) => {
      item.position = position;
    });
    if (snapshots.length === 0) {
      throw new ApiError("CONFLICT", "原清单已没有可用菜品", 409);
    }
    let totalCents: number;
    try {
      totalCents = calculateListTotal(
        snapshots.map((item) => ({
          dishId: item.dishId,
          priceCents: item.priceCentsSnapshot,
          quantity: item.quantity,
        })),
      );
    } catch {
      throw new ApiError("CONFLICT", "按当前价格计算的清单合计超出允许范围", 409);
    }
    const created = await tx.savedList.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        items: { createMany: { data: snapshots } },
        name: input.name,
        totalCents,
        userId,
      },
      select: { id: true },
    });
    return { listId: created.id, skippedItemNames };
  });

  return {
    list: await getList(userId, result.listId),
    skippedItemNames: result.skippedItemNames,
  };
}

export async function deleteList(userId: string, listId: string) {
  const deleted = await prisma.savedList.deleteMany({
    where: { id: listId, userId },
  });
  if (deleted.count !== 1) {
    throw new ApiError("NOT_FOUND", "清单不存在", 404);
  }
  return { success: true as const };
}
