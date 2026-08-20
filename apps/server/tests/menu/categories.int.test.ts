import { beforeEach, describe, expect, it } from "vitest";

import {
  createCategory,
  listAdminCategories,
  softDeleteCategory,
  updateCategory,
} from "../../src/modules/menu/category-service";
import { prisma } from "../../src/lib/prisma";
import { resetDatabase } from "../helpers/database";

describe("category administration", () => {
  beforeEach(resetDatabase);

  it("creates, lists, and updates a category with optimistic concurrency", async () => {
    const created = await createCategory({
      enabled: true,
      name: " 热菜 ",
      sortOrder: 2,
    });
    const updated = await updateCategory(created.id, {
      enabled: false,
      expectedUpdatedAt: created.updatedAt,
      name: "家常热菜",
      sortOrder: 3,
    });
    const page = await listAdminCategories({
      includeDeleted: false,
      limit: 20,
    });

    expect(updated).toMatchObject({
      enabled: false,
      name: "家常热菜",
      sortOrder: 3,
    });
    expect(page.items).toHaveLength(1);
    await expect(
      updateCategory(created.id, {
        enabled: true,
        expectedUpdatedAt: created.updatedAt,
        name: "过期更新",
        sortOrder: 4,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to delete a category with a non-deleted dish", async () => {
    const category = await createCategory({
      enabled: true,
      name: "热菜",
      sortOrder: 1,
    });
    await prisma.dish.create({
      data: {
        categoryId: category.id,
        name: "番茄炒蛋",
        priceCents: 1_800,
      },
    });

    await expect(
      softDeleteCategory(category.id, category.updatedAt),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("soft-deletes an empty category", async () => {
    const category = await createCategory({
      enabled: true,
      name: "空分类",
      sortOrder: 1,
    });

    await softDeleteCategory(category.id, category.updatedAt);

    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: category.id } }),
    ).resolves.toMatchObject({ enabled: false, deletedAt: expect.any(Date) });
  });
});
