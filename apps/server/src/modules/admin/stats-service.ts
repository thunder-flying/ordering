import "server-only";

import type { AdminStatsDto } from "@ordering/contracts";

import { prisma } from "../../lib/prisma";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

export async function getAdminStats(
  now = new Date(),
): Promise<AdminStatsDto> {
  const activeSince = new Date(now.getTime() - SEVEN_DAYS_MS);
  const [userCount, activeUsers7d, favoriteCount, listCount, popularDishes] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastLoginAt: { gte: activeSince } } }),
      prisma.favorite.count(),
      prisma.savedList.count(),
      prisma.dish.findMany({
        where: { favorites: { some: {} } },
        orderBy: [{ favorites: { _count: "desc" } }, { id: "asc" }],
        select: {
          _count: { select: { favorites: true } },
          id: true,
          name: true,
        },
        take: 10,
      }),
    ]);

  return {
    activeUsers7d,
    favoriteCount,
    listCount,
    topDishes: popularDishes.map((dish) => ({
      dishId: dish.id,
      dishName: dish.name,
      favoriteCount: dish._count.favorites,
    })),
    userCount,
  };
}
