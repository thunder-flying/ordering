import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  listPublicCategories,
  resolveDishAvailability,
  searchPublicDishes,
} from "../../src/modules/menu/menu-query";
import { resetDatabase } from "../helpers/database";

async function seedDish(options: {
  categoryEnabled?: boolean;
  categoryDeleted?: boolean;
  dishDeleted?: boolean;
  name: string;
  published?: boolean;
  sortOrder: number;
}) {
  const category = await prisma.category.create({
    data: {
      deletedAt: options.categoryDeleted ? new Date() : null,
      enabled: options.categoryEnabled ?? true,
      name: `分类-${options.name}`,
      sortOrder: options.sortOrder,
    },
  });
  const upload = await prisma.upload.create({
    data: {
      byteSize: 68,
      detectedMediaType: "image/png",
      originalMediaType: "image/png",
      purpose: "DISH_IMAGE",
      referenceState: "REFERENCED",
      sha256: options.sortOrder.toString().padStart(64, "0"),
      storageKey: `${options.sortOrder}.png`,
    },
  });
  const dish = await prisma.dish.create({
    data: {
      categoryId: category.id,
      deletedAt: options.dishDeleted ? new Date() : null,
      description: `${options.name}简介`,
      imageUploadId: upload.id,
      name: options.name,
      priceCents: 1_800 + options.sortOrder,
      published: options.published ?? true,
      sortOrder: options.sortOrder,
    },
  });
  return { category, dish };
}

describe("public menu queries", () => {
  beforeEach(resetDatabase);

  it("excludes disabled/deleted categories and unpublished/deleted dishes", async () => {
    const visible = await seedDish({ name: "番茄炒蛋", sortOrder: 1 });
    const disabledCategory = await seedDish({
      categoryEnabled: false,
      name: "禁用分类菜",
      sortOrder: 2,
    });
    const deletedCategory = await seedDish({
      categoryDeleted: true,
      name: "删除分类菜",
      sortOrder: 3,
    });
    await seedDish({ name: "未上架菜", published: false, sortOrder: 4 });
    await seedDish({ dishDeleted: true, name: "已删除菜", sortOrder: 5 });

    const categories = await listPublicCategories();
    const page = await searchPublicDishes({ q: "", limit: 20 });

    expect(categories.map((item) => item.id)).toContain(visible.category.id);
    expect(categories.map((item) => item.id)).not.toContain(
      disabledCategory.category.id,
    );
    expect(categories.map((item) => item.id)).not.toContain(
      deletedCategory.category.id,
    );
    expect(page.items.map((item) => item.id)).toEqual([visible.dish.id]);
    expect(page.items[0]).toMatchObject({
      imageUrl: "/media/dishes/1.png",
      referencePriceCents: 1_801,
    });
  });

  it("matches a trimmed name substring and paginates stably", async () => {
    const first = await seedDish({ name: "番茄炒蛋", sortOrder: 1 });
    const second = await seedDish({ name: "番茄牛腩", sortOrder: 2 });
    await seedDish({ name: "青椒肉丝", sortOrder: 3 });

    const firstPage = await searchPublicDishes({ q: "番茄", limit: 1 });
    const secondPage = await searchPublicDishes({
      q: "番茄",
      cursor: firstPage.nextCursor ?? undefined,
      limit: 1,
    });

    expect(firstPage.items[0]?.id).toBe(first.dish.id);
    expect(firstPage.nextCursor).toBe(first.dish.id);
    expect(secondPage.items[0]?.id).toBe(second.dish.id);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("resolves availability in input order", async () => {
    const visible = await seedDish({ name: "可用菜", sortOrder: 1 });
    const hidden = await seedDish({
      name: "不可用菜",
      published: false,
      sortOrder: 2,
    });

    const items = await resolveDishAvailability([
      hidden.dish.id,
      visible.dish.id,
    ]);

    expect(items[0]).toEqual({ dishId: hidden.dish.id, available: false });
    expect(items[1]).toMatchObject({
      dishId: visible.dish.id,
      available: true,
      dish: { id: visible.dish.id },
    });
  });
});
