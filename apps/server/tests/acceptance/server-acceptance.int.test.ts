import { randomUUID } from "node:crypto";

import { SaveListInput } from "@ordering/contracts";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/lib/prisma";
import { requireUser } from "../../src/modules/auth/require-user";
import { createUserSession } from "../../src/modules/auth/session-service";
import {
  addFavorite,
  listFavorites,
} from "../../src/modules/favorites/favorite-service";
import {
  createList,
  getList,
  listLists,
  updateList,
} from "../../src/modules/lists/list-service";
import { searchPublicDishes } from "../../src/modules/menu/menu-query";
import { clearPrivateData } from "../../src/modules/profile/profile-service";
import { resetDatabase } from "../helpers/database";

const { exchangeCode } = vi.hoisted(() => ({ exchangeCode: vi.fn() }));

vi.mock("../../src/modules/auth/wechat-client", () => ({ exchangeCode }));

function bearer(token: string) {
  return new NextRequest("http://localhost/api/v1/acceptance", {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function seedPublicMenu() {
  const category = await prisma.category.create({
    data: { enabled: true, name: "验收分类" },
  });
  const uploads = await Promise.all(
    ["acceptance-a.png", "acceptance-b.png"].map((storageKey, index) =>
      prisma.upload.create({
        data: {
          byteSize: 68,
          detectedMediaType: "image/png",
          originalMediaType: "image/png",
          purpose: "DISH_IMAGE",
          referenceState: "REFERENCED",
          sha256: String(index + 1).repeat(64),
          storageKey,
        },
      }),
    ),
  );
  const [dishA, dishB] = await Promise.all([
    prisma.dish.create({
      data: {
        categoryId: category.id,
        imageUploadId: uploads[0]!.id,
        name: "验收菜品 A",
        priceCents: 1_000,
        published: true,
      },
    }),
    prisma.dish.create({
      data: {
        categoryId: category.id,
        imageUploadId: uploads[1]!.id,
        name: "验收菜品 B",
        priceCents: 500,
        published: true,
      },
    }),
  ]);
  return { category, dishA, dishB };
}

describe("server acceptance journey", () => {
  beforeEach(async () => {
    await resetDatabase();
    exchangeCode.mockReset();
    exchangeCode.mockImplementation(async (code: string) => ({
      openid: code === "code-a" ? "raw-openid-a" : "raw-openid-b",
    }));
  });

  it("keeps two users isolated through menu, favorites, lists, prices, and clearing", async () => {
    const { category, dishA, dishB } = await seedPublicMenu();
    const [sessionA, sessionB] = await Promise.all([
      createUserSession("code-a"),
      createUserSession("code-b"),
    ]);
    const [userA, userB] = await Promise.all([
      requireUser(bearer(sessionA.token)),
      requireUser(bearer(sessionB.token)),
    ]);

    const publicMenu = await searchPublicDishes({ limit: 20, q: "" });
    expect(publicMenu.items.map((dish) => dish.id).sort()).toEqual(
      [dishA.id, dishB.id].sort(),
    );
    await Promise.all([
      addFavorite(userA.userId, dishA.id),
      addFavorite(userB.userId, dishB.id),
    ]);

    const listA = await createList(userA.userId, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dishA.id, note: "", quantity: 1 }],
      name: "A 的清单",
    });
    const listB = await createList(userB.userId, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dishB.id, note: "", quantity: 2 }],
      name: "B 的清单",
    });

    expect(() =>
      SaveListInput.parse({
        idempotencyKey: randomUUID(),
        items: [
          {
            dishId: dishA.id,
            note: "",
            quantity: 1,
            referencePriceCents: 1,
          },
        ],
        name: "伪造价格",
      }),
    ).toThrow();
    await prisma.dish.update({
      where: { id: dishA.id },
      data: { priceCents: 2_000 },
    });
    await expect(getList(userA.userId, listA.id)).resolves.toMatchObject({
      totalCents: 1_000,
    });
    await expect(
      updateList(userA.userId, listA.id, {
        expectedUpdatedAt: listA.updatedAt,
        idempotencyKey: randomUUID(),
        items: [{ dishId: dishA.id, note: "当前价格", quantity: 1 }],
        name: "A 的新清单",
      }),
    ).resolves.toMatchObject({ totalCents: 2_000 });

    await prisma.category.update({
      where: { id: category.id },
      data: { enabled: false },
    });
    await expect(searchPublicDishes({ limit: 20, q: "" })).resolves.toMatchObject({
      items: [],
    });

    await clearPrivateData(userA.userId);
    await expect(listFavorites(userA.userId, { limit: 20 })).resolves.toMatchObject({
      items: [],
    });
    await expect(listLists(userA.userId, { limit: 20 })).resolves.toMatchObject({
      items: [],
    });
    await expect(listLists(userB.userId, { limit: 20 })).resolves.toMatchObject({
      items: [{ id: listB.id, name: "B 的清单" }],
    });
    expect(await prisma.favorite.count({ where: { userId: userB.userId } })).toBe(1);

    const storedUsers = await prisma.user.findMany({ select: { openidDigest: true } });
    const storedSessions = await prisma.userSession.findMany({
      select: { tokenHash: true },
    });
    expect(JSON.stringify(storedUsers)).not.toContain("raw-openid");
    expect(JSON.stringify(storedSessions)).not.toContain(sessionA.token);
    expect(JSON.stringify(storedSessions)).not.toContain(sessionB.token);
  });
});
