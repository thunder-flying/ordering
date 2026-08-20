import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  clearPrivateData,
  completeOnboarding,
  deleteAccount,
  getProfile,
  replaceAvatar,
  updateNickname,
} from "../../src/modules/profile/profile-service";
import { createList } from "../../src/modules/lists/list-service";
import { resetDatabase } from "../helpers/database";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0YAAAAASUVORK5CYII=",
  "base64",
);

let uploadRoot: string;

async function seedUserAndAvailableDish() {
  const [user, category] = await Promise.all([
    prisma.user.create({ data: { openidDigest: "a".repeat(64) } }),
    prisma.category.create({ data: { name: "热菜" } }),
  ]);
  const upload = await prisma.upload.create({
    data: {
      byteSize: 68,
      detectedMediaType: "image/png",
      originalMediaType: "image/png",
      purpose: "DISH_IMAGE",
      referenceState: "REFERENCED",
      sha256: "b".repeat(64),
      storageKey: "profile-dish.png",
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
  return { dish, user };
}

describe("optional profile and privacy controls", () => {
  beforeEach(async () => {
    await resetDatabase();
    uploadRoot = await mkdtemp(join(tmpdir(), "ordering-profile-"));
  });

  afterEach(async () => {
    await rm(uploadRoot, { force: true, recursive: true });
  });

  it("returns defaults, updates nickname, and completes onboarding idempotently", async () => {
    const { user } = await seedUserAndAvailableDish();

    await expect(getProfile(user.id)).resolves.toEqual({
      avatarUrl: null,
      nickname: "微信用户",
      onboardingCompleted: false,
      profileComplete: false,
    });
    await expect(updateNickname(user.id, "小明")).resolves.toMatchObject({
      nickname: "小明",
      profileComplete: false,
    });
    await completeOnboarding(user.id);
    await completeOnboarding(user.id);
    await expect(getProfile(user.id)).resolves.toMatchObject({
      onboardingCompleted: true,
    });
  });

  it("atomically replaces avatars and removes the old file after commit", async () => {
    const { user } = await seedUserAndAvailableDish();
    await updateNickname(user.id, "小明");

    const first = await replaceAvatar(
      user.id,
      new File([onePixelPng], "first.png", { type: "image/png" }),
      { uploadRoot },
    );
    expect(first.profileComplete).toBe(true);
    const oldUpload = await prisma.upload.findFirstOrThrow({
      where: { ownerUserId: user.id, purpose: "AVATAR" },
    });
    await access(join(uploadRoot, "avatars", oldUpload.storageKey));

    await replaceAvatar(
      user.id,
      new File([onePixelPng], "second.png", { type: "image/png" }),
      { uploadRoot },
    );
    await expect(
      access(join(uploadRoot, "avatars", oldUpload.storageKey)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await prisma.upload.findUnique({ where: { id: oldUpload.id } })).toBeNull();
  });

  it("clears only favorites and lists while preserving profile and session", async () => {
    const { dish, user } = await seedUserAndAvailableDish();
    const session = await prisma.userSession.create({
      data: {
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: "c".repeat(64),
        userId: user.id,
      },
    });
    await prisma.favorite.create({ data: { dishId: dish.id, userId: user.id } });
    await createList(user.id, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dish.id, note: "", quantity: 1 }],
      name: "我的清单",
    });
    await updateNickname(user.id, "小明");
    await completeOnboarding(user.id);

    await clearPrivateData(user.id);

    expect(await prisma.favorite.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.savedList.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.userSession.findUnique({ where: { id: session.id } })).not.toBeNull();
    await expect(getProfile(user.id)).resolves.toMatchObject({
      nickname: "小明",
      onboardingCompleted: true,
    });
  });

  it("deletes the account, all private rows, and its avatar", async () => {
    const { dish, user } = await seedUserAndAvailableDish();
    await prisma.userSession.create({
      data: {
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: "d".repeat(64),
        userId: user.id,
      },
    });
    await prisma.favorite.create({ data: { dishId: dish.id, userId: user.id } });
    await createList(user.id, {
      idempotencyKey: randomUUID(),
      items: [{ dishId: dish.id, note: "", quantity: 1 }],
      name: "我的清单",
    });
    await replaceAvatar(
      user.id,
      new File([onePixelPng], "avatar.png", { type: "image/png" }),
      { uploadRoot },
    );
    const avatar = await prisma.upload.findFirstOrThrow({
      where: { ownerUserId: user.id, purpose: "AVATAR" },
    });

    await deleteAccount(user.id, { uploadRoot });

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.favorite.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.savedList.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.upload.findUnique({ where: { id: avatar.id } })).toBeNull();
    await expect(
      access(join(uploadRoot, "avatars", avatar.storageKey)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
