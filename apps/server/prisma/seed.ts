import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  PUBLIC_MENU_SEED,
  validateSeedCatalog,
} from "../src/modules/menu/seed-catalog";
import { buildSeedImageMetadata } from "../src/modules/menu/seed-image";
import { selectRetirableLegacyCategoryIds } from "../src/modules/menu/seed-legacy-category";

const databaseUrl = process.env.DATABASE_URL;
const uploadRoot = process.env.UPLOAD_ROOT;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!uploadRoot) throw new Error("UPLOAD_ROOT is required");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
});
const seedAssetDirectory = fileURLToPath(
  new URL("./seed-assets/dishes/", import.meta.url),
);

async function retireLegacySeedCategories() {
  const candidates = await prisma.category.findMany({
    where: { deletedAt: null, name: { in: ["家常菜"] } },
    select: {
      _count: { select: { dishes: true } },
      id: true,
      name: true,
    },
  });
  const categoryIds = selectRetirableLegacyCategoryIds(
    candidates.map((category) => ({
      dishCount: category._count.dishes,
      id: category.id,
      name: category.name,
    })),
  );

  if (categoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  }
}

async function upsertCategory(name: string, sortOrder: number) {
  const existing = await prisma.category.findFirst({
    where: { deletedAt: null, name },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return existing
    ? prisma.category.update({
        where: { id: existing.id },
        data: { enabled: true, sortOrder },
        select: { id: true },
      })
    : prisma.category.create({
        data: { enabled: true, name, sortOrder },
        select: { id: true },
      });
}

async function seedPublicMenu() {
  validateSeedCatalog(PUBLIC_MENU_SEED);
  await retireLegacySeedCategories();

  const uploadDirectory = resolve(uploadRoot, "dishes");
  await mkdir(uploadDirectory, { recursive: true });

  for (const categorySeed of PUBLIC_MENU_SEED) {
    const category = await upsertCategory(
      categorySeed.name,
      categorySeed.sortOrder,
    );

    for (const [dishIndex, dishSeed] of categorySeed.dishes.entries()) {
      const assetPath = resolve(seedAssetDirectory, dishSeed.assetFileName);
      const bytes = await readFile(assetPath);
      const image = buildSeedImageMetadata(bytes, dishSeed.assetFileName);
      await copyFile(assetPath, resolve(uploadDirectory, image.storageKey));

      const upload = await prisma.upload.upsert({
        where: { storageKey: image.storageKey },
        create: {
          byteSize: image.byteSize,
          detectedMediaType: image.mediaType,
          originalMediaType: image.mediaType,
          purpose: "DISH_IMAGE",
          referenceState: "REFERENCED",
          sha256: image.sha256,
          storageKey: image.storageKey,
        },
        update: {
          byteSize: image.byteSize,
          detectedMediaType: image.mediaType,
          originalMediaType: image.mediaType,
          pendingDeleteAt: null,
          referenceState: "REFERENCED",
          sha256: image.sha256,
        },
        select: { id: true },
      });

      const existingDish = await prisma.dish.findFirst({
        where: {
          categoryId: category.id,
          deletedAt: null,
          name: dishSeed.name,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const dishData = {
        description: dishSeed.description,
        imageUploadId: upload.id,
        priceCents: dishSeed.priceCents,
        published: true,
        sortOrder: dishIndex,
      };

      if (existingDish) {
        await prisma.dish.update({
          where: { id: existingDish.id },
          data: dishData,
        });
      } else {
        await prisma.dish.create({
          data: {
            ...dishData,
            categoryId: category.id,
            name: dishSeed.name,
          },
        });
      }
    }
  }
}

seedPublicMenu()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
