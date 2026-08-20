import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { getAdminStats } from "../../src/modules/admin/stats-service";
import { resetDatabase } from "../helpers/database";

describe("privacy-preserving administrator statistics", () => {
  beforeEach(resetDatabase);

  it("returns only aggregate counts and dish popularity", async () => {
    const now = new Date("2026-08-20T04:00:00.000Z");
    const [activeA, activeB, inactive, category] = await Promise.all([
      prisma.user.create({
        data: {
          lastLoginAt: new Date("2026-08-19T04:00:00.000Z"),
          nickname: "不应泄露的昵称",
          openidDigest: "a".repeat(64),
        },
      }),
      prisma.user.create({
        data: {
          lastLoginAt: new Date("2026-08-14T04:00:00.000Z"),
          openidDigest: "b".repeat(64),
        },
      }),
      prisma.user.create({
        data: {
          lastLoginAt: new Date("2026-08-13T03:59:59.999Z"),
          openidDigest: "c".repeat(64),
        },
      }),
      prisma.category.create({ data: { name: "热菜" } }),
    ]);
    const [dishA, dishB] = await Promise.all([
      prisma.dish.create({
        data: { categoryId: category.id, name: "米饭", priceCents: 200 },
      }),
      prisma.dish.create({
        data: { categoryId: category.id, name: "炒蛋", priceCents: 1_800 },
      }),
    ]);
    await prisma.favorite.createMany({
      data: [
        { dishId: dishA.id, userId: activeA.id },
        { dishId: dishA.id, userId: activeB.id },
        { dishId: dishB.id, userId: inactive.id },
      ],
    });
    await prisma.savedList.create({
      data: {
        idempotencyKey: "list-key",
        name: "不应泄露的清单名",
        totalCents: 200,
        userId: activeA.id,
      },
    });

    const result = await getAdminStats(now);

    expect(Object.keys(result).sort()).toEqual([
      "activeUsers7d",
      "favoriteCount",
      "listCount",
      "topDishes",
      "userCount",
    ]);
    expect(result).toMatchObject({
      activeUsers7d: 2,
      favoriteCount: 3,
      listCount: 1,
      userCount: 3,
    });
    expect(result.topDishes).toEqual([
      { dishId: dishA.id, dishName: "米饭", favoriteCount: 2 },
      { dishId: dishB.id, dishName: "炒蛋", favoriteCount: 1 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /openid|nickname|avatar|userId|listName|不应泄露/i,
    );
  });
});
