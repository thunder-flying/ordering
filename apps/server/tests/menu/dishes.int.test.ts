import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as getDishMedia } from "../../src/app/media/dishes/[key]/route";
import { prisma } from "../../src/lib/prisma";
import {
  createDish,
  softDeleteDish,
  updateDish,
} from "../../src/modules/menu/dish-service";
import { searchPublicDishes } from "../../src/modules/menu/menu-query";
import {
  cleanupExpiredUploads,
  storeDishImage,
} from "../../src/modules/uploads/upload-service";
import { resetDatabase } from "../helpers/database";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0YAAAAASUVORK5CYII=",
  "base64",
);

let uploadRoot: string;

function pngFile(name: string) {
  return new File([onePixelPng], name, { type: "image/png" });
}

describe("dish administration and uploads", () => {
  beforeAll(async () => {
    uploadRoot = await mkdtemp(join(tmpdir(), "ordering-uploads-"));
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await rm(uploadRoot, { force: true, recursive: true });
  });

  it("creates, updates, publishes, and soft-deletes a dish", async () => {
    const category = await prisma.category.create({
      data: { enabled: true, name: "热菜", sortOrder: 1 },
    });
    const firstUpload = await storeDishImage(pngFile("first.png"), {
      uploadRoot,
    });
    const created = await createDish({
      categoryId: category.id,
      description: "家常口味",
      imageUploadId: firstUpload.id,
      name: "番茄炒蛋",
      published: true,
      referencePriceCents: 1_800,
      sortOrder: 1,
    });

    expect((await searchPublicDishes({ q: "", limit: 20 })).items).toHaveLength(1);

    const secondUpload = await storeDishImage(pngFile("second.png"), {
      uploadRoot,
    });
    const updated = await updateDish(created.id, {
      categoryId: category.id,
      description: "少油",
      expectedUpdatedAt: created.updatedAt,
      imageUploadId: secondUpload.id,
      name: "番茄炒鸡蛋",
      published: false,
      referencePriceCents: 2_000,
      sortOrder: 2,
    });
    const oldUpload = await prisma.upload.findUniqueOrThrow({
      where: { id: firstUpload.id },
    });

    expect(updated).toMatchObject({
      imageUploadId: secondUpload.id,
      published: false,
      referencePriceCents: 2_000,
    });
    expect(oldUpload).toMatchObject({
      referenceState: "PENDING_DELETE",
      pendingDeleteAt: expect.any(Date),
    });
    expect((await searchPublicDishes({ q: "", limit: 20 })).items).toHaveLength(0);

    await expect(
      updateDish(created.id, {
        categoryId: category.id,
        description: "stale",
        expectedUpdatedAt: created.updatedAt,
        imageUploadId: secondUpload.id,
        name: "过期更新",
        published: true,
        referencePriceCents: 1,
        sortOrder: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await softDeleteDish(created.id, updated.updatedAt);
    await expect(
      prisma.dish.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ deletedAt: expect.any(Date), published: false });
  });

  it("makes a published dish unavailable when its category is disabled", async () => {
    const category = await prisma.category.create({
      data: { enabled: true, name: "热菜" },
    });
    const upload = await storeDishImage(pngFile("dish.png"), { uploadRoot });
    await createDish({
      categoryId: category.id,
      description: "",
      imageUploadId: upload.id,
      name: "可见菜",
      published: true,
      referencePriceCents: 1_000,
      sortOrder: 1,
    });

    await prisma.category.update({
      where: { id: category.id },
      data: { enabled: false },
    });

    expect((await searchPublicDishes({ q: "", limit: 20 })).items).toHaveLength(0);
  });

  it("does not create an orphan row when file persistence fails", async () => {
    const blockedRoot = join(uploadRoot, "blocked-root");
    await writeFile(blockedRoot, "this path is a file");
    const before = await prisma.upload.count();

    await expect(
      storeDishImage(pngFile("failed.png"), { uploadRoot: blockedRoot }),
    ).rejects.toBeInstanceOf(Error);

    expect(await prisma.upload.count()).toBe(before);
  });

  it("deletes only expired unreferenced files during cleanup", async () => {
    const upload = await storeDishImage(pngFile("cleanup.png"), { uploadRoot });
    const row = await prisma.upload.update({
      where: { id: upload.id },
      data: {
        pendingDeleteAt: new Date(Date.now() - 1_000),
        referenceState: "PENDING_DELETE",
      },
    });
    const path = join(uploadRoot, "dishes", row.storageKey);
    expect(existsSync(path)).toBe(true);

    await cleanupExpiredUploads(new Date(), { uploadRoot });

    expect(existsSync(path)).toBe(false);
    expect(await prisma.upload.findUnique({ where: { id: upload.id } })).toBeNull();
  });

  it("serves an uploaded dish image with immutable content headers", async () => {
    process.env.UPLOAD_ROOT = uploadRoot;
    const upload = await storeDishImage(pngFile("served.png"), { uploadRoot });
    const row = await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });

    const response = await getDishMedia(
      new NextRequest(`http://localhost/media/dishes/${row.storageKey}`),
      { params: Promise.resolve({ key: row.storageKey }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(onePixelPng);
  });
});
