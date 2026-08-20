import "server-only";

import type { ProfileDto } from "@ordering/contracts";

import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";
import {
  type AvatarStorageOptions,
  removePendingAvatarUpload,
  replaceUserAvatar,
} from "../uploads/avatar-service";
import { createSignedAvatarUrl } from "../uploads/signed-avatar-url";

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", "用户不存在", 404);
}

export async function getProfile(userId: string): Promise<ProfileDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUpload: {
        select: { referenceState: true, storageKey: true },
      },
      nickname: true,
      onboardingCompletedAt: true,
    },
  });
  if (!user) throw notFound();

  const avatar =
    user.avatarUpload?.referenceState === "REFERENCED"
      ? user.avatarUpload
      : null;
  return {
    avatarUrl: avatar ? createSignedAvatarUrl(avatar.storageKey) : null,
    nickname: user.nickname,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    profileComplete: avatar !== null && user.nickname !== "微信用户",
  };
}

export async function updateNickname(
  userId: string,
  nickname: string,
): Promise<ProfileDto> {
  const updated = await prisma.user.updateMany({
    where: { id: userId },
    data: { nickname },
  });
  if (updated.count !== 1) throw notFound();
  return getProfile(userId);
}

export async function replaceAvatar(
  userId: string,
  file: File,
  options: AvatarStorageOptions = {},
): Promise<ProfileDto> {
  await replaceUserAvatar(userId, file, options);
  return getProfile(userId);
}

export async function completeOnboarding(userId: string): Promise<ProfileDto> {
  const updated = await prisma.user.updateMany({
    where: { id: userId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
  if (updated.count === 0) {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw notFound();
  }
  return getProfile(userId);
}

export async function clearPrivateData(userId: string) {
  await prisma.$transaction(async (tx) => {
    const exists = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw notFound();

    await tx.favorite.deleteMany({ where: { userId } });
    await tx.savedList.deleteMany({ where: { userId } });
  });
  return { success: true as const };
}

export async function deleteAccount(
  userId: string,
  options: AvatarStorageOptions = {},
) {
  const avatar = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        avatarUpload: { select: { id: true, storageKey: true } },
        id: true,
      },
    });
    if (!user) throw notFound();

    if (user.avatarUpload) {
      await tx.user.update({
        where: { id: userId },
        data: { avatarUploadId: null },
      });
      await tx.upload.update({
        where: { id: user.avatarUpload.id },
        data: {
          ownerUserId: null,
          pendingDeleteAt: new Date(),
          referenceState: "PENDING_DELETE",
        },
      });
    }
    await tx.user.delete({ where: { id: userId } });
    return user.avatarUpload;
  });

  if (avatar) {
    await removePendingAvatarUpload(avatar, options);
  }
  return { success: true as const };
}
