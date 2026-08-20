import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
} from "../../src/modules/favorites/favorite-service";
import { resetDatabase } from "../helpers/database";

async function seedUsersAndDish() {
  const [userA, userB, category] = await Promise.all([
    prisma.user.create({ data: { openidDigest: "a".repeat(64) } }),
    prisma.user.create({ data: { openidDigest: "b".repeat(64) } }),
    prisma.category.create({ data: { enabled: true, name: "热菜" } }),
  ]);
  const upload = await prisma.upload.create({
    data: {
      byteSize: 68,
      detectedMediaType: "image/png",
      originalMediaType: "image/png",
      purpose: "DISH_IMAGE",
      referenceState: "REFERENCED",
      sha256: "c".repeat(64),
      storageKey: "favorite.png",
    },
  });
  const dish = await prisma.dish.create({
    data: {
      categoryId: category.id,
      imageUploadId: upload.id,
      name: "番茄炒蛋",
      priceCents: 1_800,
      published: true,
    },
  });
  return { category, dish, userA, userB };
}

describe("favorites", () => {
  beforeEach(resetDatabase);

  it("adds and removes idempotently", async () => {
    const { dish, userA } = await seedUsersAndDish();

    await addFavorite(userA.id, dish.id);
    await addFavorite(userA.id, dish.id);
    expect(await prisma.favorite.count()).toBe(1);

    await removeFavorite(userA.id, dish.id);
    await removeFavorite(userA.id, dish.id);
    expect(await prisma.favorite.count()).toBe(0);
  });

  it("never exposes another user's favorite", async () => {
    const { dish, userA, userB } = await seedUsersAndDish();
    await addFavorite(userB.id, dish.id);

    await expect(
      listFavorites(userA.id, { limit: 20 }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      listFavorites(userB.id, { limit: 20 }),
    ).resolves.toMatchObject({ items: [{ id: dish.id }] });
  });

  it("omits a favorite when its dish becomes unavailable", async () => {
    const { dish, userA } = await seedUsersAndDish();
    await addFavorite(userA.id, dish.id);
    await prisma.dish.update({
      where: { id: dish.id },
      data: { published: false },
    });

    await expect(
      listFavorites(userA.id, { limit: 20 }),
    ).resolves.toMatchObject({ items: [] });
  });

  it("refuses to favorite an unavailable dish", async () => {
    const { dish, userA } = await seedUsersAndDish();
    await prisma.dish.update({
      where: { id: dish.id },
      data: { deletedAt: new Date() },
    });

    await expect(addFavorite(userA.id, dish.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
