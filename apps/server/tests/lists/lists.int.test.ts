import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  copyList,
  createList,
  deleteList,
  getList,
  listLists,
  updateList,
} from "../../src/modules/lists/list-service";
import { resetDatabase } from "../helpers/database";

async function seedFixture() {
  const [userA, userB, category] = await Promise.all([
    prisma.user.create({ data: { openidDigest: "a".repeat(64) } }),
    prisma.user.create({ data: { openidDigest: "b".repeat(64) } }),
    prisma.category.create({ data: { enabled: true, name: "热菜" } }),
  ]);
  const uploads = await Promise.all(
    ["one", "two"].map((key) =>
      prisma.upload.create({
        data: {
          byteSize: 68,
          detectedMediaType: "image/png",
          originalMediaType: "image/png",
          purpose: "DISH_IMAGE",
          referenceState: "REFERENCED",
          sha256: key.repeat(64).slice(0, 64),
          storageKey: `${key}.png`,
        },
      }),
    ),
  );
  const [dishA, dishB] = await Promise.all([
    prisma.dish.create({
      data: {
        categoryId: category.id,
        imageUploadId: uploads[0]!.id,
        name: "番茄炒蛋",
        priceCents: 1_299,
        published: true,
      },
    }),
    prisma.dish.create({
      data: {
        categoryId: category.id,
        imageUploadId: uploads[1]!.id,
        name: "米饭",
        priceCents: 500,
        published: true,
      },
    }),
  ]);
  return { category, dishA, dishB, userA, userB };
}

describe("private saved lists", () => {
  beforeEach(resetDatabase);

  it("uses server prices, preserves snapshots, and retries creation idempotently", async () => {
    const { dishA, dishB, userA } = await seedFixture();
    const input = {
      idempotencyKey: randomUUID(),
      items: [
        { dishId: dishA.id, note: "少盐", quantity: 2 },
        { dishId: dishB.id, note: "", quantity: 3 },
      ],
      name: "周末菜单",
    };

    const created = await createList(userA.id, input);
    expect(created.totalCents).toBe(4_098);
    expect(created.items.map((item) => item.referencePriceCentsSnapshot)).toEqual([
      1_299,
      500,
    ]);

    await prisma.dish.update({
      where: { id: dishA.id },
      data: { name: "新名称", priceCents: 2_000 },
    });
    const retry = await createList(userA.id, {
      ...input,
      name: "重试时不应覆盖",
    });
    expect(retry.id).toBe(created.id);
    expect(retry.name).toBe("周末菜单");
    expect((await getList(userA.id, created.id)).totalCents).toBe(4_098);
    expect(await prisma.savedList.count()).toBe(1);
  });

  it("rejects unavailable dishes and never accepts a client price", async () => {
    const { dishA, userA } = await seedFixture();
    await prisma.dish.update({
      where: { id: dishA.id },
      data: { published: false },
    });

    await expect(
      createList(userA.id, {
        idempotencyKey: randomUUID(),
        items: [{ dishId: dishA.id, note: "", quantity: 1 }],
        name: "不可用",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("edits with current prices, optimistic concurrency, and retry idempotency", async () => {
    const { dishA, dishB, userA } = await seedFixture();
    const created = await createList(userA.id, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dishA.id, note: "", quantity: 1 }],
      name: "初版",
    });
    await prisma.dish.update({
      where: { id: dishB.id },
      data: { priceCents: 800 },
    });
    const updateInput = {
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: randomUUID(),
      items: [{ dishId: dishB.id, note: "加一份", quantity: 2 }],
      name: "新版",
    };

    const updated = await updateList(userA.id, created.id, updateInput);
    expect(updated.totalCents).toBe(1_600);
    expect(updated.items[0]).toMatchObject({
      nameSnapshot: "米饭",
      referencePriceCentsSnapshot: 800,
    });

    const retry = await updateList(userA.id, created.id, {
      ...updateInput,
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(retry.id).toBe(updated.id);
    await expect(
      updateList(userA.id, created.id, {
        ...updateInput,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("copies only currently available dishes at current prices", async () => {
    const { dishA, dishB, userA } = await seedFixture();
    const source = await createList(userA.id, {
      idempotencyKey: randomUUID(),
      items: [
        { dishId: dishA.id, note: "", quantity: 1 },
        { dishId: dishB.id, note: "", quantity: 2 },
      ],
      name: "旧清单",
    });
    await Promise.all([
      prisma.dish.update({
        where: { id: dishA.id },
        data: { priceCents: 2_200 },
      }),
      prisma.dish.update({
        where: { id: dishB.id },
        data: { published: false },
      }),
    ]);
    const key = randomUUID();

    const copied = await copyList(userA.id, source.id, {
      idempotencyKey: key,
      name: "今日清单",
    });
    expect(copied.skippedItemNames).toEqual(["米饭"]);
    expect(copied.list).toMatchObject({ itemCount: 1, totalCents: 2_200 });
    expect((await copyList(userA.id, source.id, {
      idempotencyKey: key,
      name: "不会重复",
    })).list.id).toBe(copied.list.id);
    expect(await prisma.savedList.count()).toBe(2);
  });

  it("refuses to copy when no source item remains available", async () => {
    const { dishA, userA } = await seedFixture();
    const source = await createList(userA.id, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dishA.id, note: "", quantity: 1 }],
      name: "旧清单",
    });
    await prisma.dish.update({
      where: { id: dishA.id },
      data: { deletedAt: new Date() },
    });

    await expect(
      copyList(userA.id, source.id, {
        idempotencyKey: randomUUID(),
        name: "空清单",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("hides foreign IDs for reads, edits, copies, and deletes", async () => {
    const { dishA, userA, userB } = await seedFixture();
    const foreign = await createList(userB.id, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dishA.id, note: "", quantity: 1 }],
      name: "他人的清单",
    });

    await expect(getList(userA.id, foreign.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateList(userA.id, foreign.id, {
        expectedUpdatedAt: foreign.updatedAt,
        idempotencyKey: randomUUID(),
        items: [{ dishId: dishA.id, note: "", quantity: 1 }],
        name: "越权修改",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      copyList(userA.id, foreign.id, {
        idempotencyKey: randomUUID(),
        name: "越权复制",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteList(userA.id, foreign.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listLists(userA.id, { limit: 20 })).resolves.toMatchObject({
      items: [],
    });
  });
});
