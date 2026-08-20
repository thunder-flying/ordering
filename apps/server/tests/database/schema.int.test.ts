import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { resetDatabase, seedUserAndDish } from "../helpers/database";

describe("database constraints", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects a duplicate favorite for the same user and dish", async () => {
    const { dish, user } = await seedUserAndDish();

    await prisma.favorite.create({
      data: { dishId: dish.id, userId: user.id },
    });

    await expect(
      prisma.favorite.create({
        data: { dishId: dish.id, userId: user.id },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
