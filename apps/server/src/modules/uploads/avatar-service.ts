import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { env } from "../../lib/env";
import { ApiError } from "../../lib/http/api-error";
import { prisma } from "../../lib/prisma";
import { inspectImageFile } from "./file-inspector";
import { resolvedUploadPath } from "./upload-service";

const AVATAR_MAX_BYTES = 2 * 1_024 * 1_024;

export type AvatarStorageOptions = {
  uploadRoot?: string;
};

type PendingAvatar = {
  id: string;
  storageKey: string;
};

export async function removePendingAvatarUpload(
  avatar: PendingAvatar,
  options: AvatarStorageOptions = {},
): Promise<boolean> {
  const uploadRoot = options.uploadRoot ?? env.UPLOAD_ROOT;
  try {
    try {
      await unlink(resolvedUploadPath(uploadRoot, "AVATAR", avatar.storageKey));
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code !== "ENOENT") throw error;
    }

    const deleted = await prisma.upload.deleteMany({
      where: {
        avatarForUser: null,
        id: avatar.id,
        purpose: "AVATAR",
        referenceState: "PENDING_DELETE",
      },
    });
    return deleted.count === 1;
  } catch {
    return false;
  }
}

export async function replaceUserAvatar(
  userId: string,
  file: File,
  options: AvatarStorageOptions = {},
): Promise<void> {
  const inspected = await inspectImageFile(file, AVATAR_MAX_BYTES);
  const uploadRoot = options.uploadRoot ?? env.UPLOAD_ROOT;
  const storageKey = `${randomBytes(18).toString("hex")}.${inspected.extension}`;
  const finalPath = resolvedUploadPath(uploadRoot, "AVATAR", storageKey);
  const directory = resolve(uploadRoot, "avatars");
  const temporaryPath = join(
    directory,
    `.${storageKey}.${randomBytes(8).toString("hex")}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, inspected.buffer, { flag: "wx" });
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  let previousAvatar: PendingAvatar | null = null;
  try {
    previousAvatar = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          avatarUpload: { select: { id: true, storageKey: true } },
          id: true,
        },
      });
      if (!user) {
        throw new ApiError("NOT_FOUND", "用户不存在", 404);
      }

      const upload = await tx.upload.create({
        data: {
          byteSize: inspected.bytes,
          detectedMediaType: inspected.mediaType,
          originalMediaType: file.type,
          ownerUserId: userId,
          purpose: "AVATAR",
          referenceState: "REFERENCED",
          sha256: inspected.sha256,
          storageKey,
        },
        select: { id: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { avatarUploadId: upload.id },
      });
      if (user.avatarUpload) {
        await tx.upload.update({
          where: { id: user.avatarUpload.id },
          data: {
            ownerUserId: null,
            pendingDeleteAt: new Date(),
            referenceState: "PENDING_DELETE",
          },
        });
      }
      return user.avatarUpload;
    });
  } catch (error) {
    await unlink(finalPath).catch(() => undefined);
    throw error;
  }

  if (previousAvatar) {
    await removePendingAvatarUpload(previousAvatar, options);
  }
}
