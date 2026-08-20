import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (databaseName !== "ordering_test") {
    throw new Error(`Refusing to reset non-test database: ${databaseName}`);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });
  try {
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
  } finally {
    await prisma.$disconnect();
  }
}
