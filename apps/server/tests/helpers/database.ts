import { prisma } from "../../src/lib/prisma";

export async function resetDatabase() {
  await prisma.$transaction([
    prisma.listItem.deleteMany(),
    prisma.savedList.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.userSession.deleteMany(),
    prisma.dish.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
    prisma.upload.deleteMany(),
  ]);
}

export async function seedUserAndDish() {
  const category = await prisma.category.create({
    data: { name: "家常菜" },
  });
  const user = await prisma.user.create({
    data: { openidDigest: "a".repeat(64) },
  });
  const dish = await prisma.dish.create({
    data: {
      categoryId: category.id,
      name: "番茄炒蛋",
      priceCents: 1800,
      published: true,
    },
  });

  return { category, dish, user };
}
