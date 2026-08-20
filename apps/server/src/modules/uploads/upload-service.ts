import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { UploadDto } from "@ordering/contracts";

import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { inspectImageFile } from "./file-inspector";

const DISH_IMAGE_MAX_BYTES = 5 * 1_024 * 1_024;

type UploadOptions = {
  uploadRoot?: string;
};

function resolvedUploadPath(
  uploadRoot: string,
  purpose: "AVATAR" | "DISH_IMAGE",
  storageKey: string,
): string {
  const root = resolve(uploadRoot);
  const directory = resolve(root, purpose === "DISH_IMAGE" ? "dishes" : "avatars");
  const path = resolve(directory, storageKey);
  const pathFromRoot = relative(root, path);

  if (
    pathFromRoot.length === 0 ||
    pathFromRoot.startsWith("..") ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error("Resolved upload path is outside UPLOAD_ROOT");
  }
  return path;
}

export async function storeDishImage(
  file: File,
  options: UploadOptions = {},
): Promise<UploadDto> {
  const inspected = await inspectImageFile(file, DISH_IMAGE_MAX_BYTES);
  const uploadRoot = options.uploadRoot ?? env.UPLOAD_ROOT;
  const storageKey = `${randomBytes(18).toString("hex")}.${inspected.extension}`;
  const finalPath = resolvedUploadPath(uploadRoot, "DISH_IMAGE", storageKey);
  const directory = resolve(uploadRoot, "dishes");
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

  try {
    const upload = await prisma.upload.create({
      data: {
        byteSize: inspected.bytes,
        detectedMediaType: inspected.mediaType,
        originalMediaType: file.type,
        purpose: "DISH_IMAGE",
        referenceState: "UNREFERENCED",
        sha256: inspected.sha256,
        storageKey,
      },
    });

    return {
      bytes: upload.byteSize,
      id: upload.id,
      mediaType: inspected.mediaType,
      previewUrl: `/media/dishes/${encodeURIComponent(storageKey)}`,
    };
  } catch (error) {
    await unlink(finalPath).catch(() => undefined);
    throw error;
  }
}

export async function cleanupExpiredUploads(
  now: Date,
  options: UploadOptions = {},
): Promise<{ deleted: number }> {
  const uploadRoot = options.uploadRoot ?? env.UPLOAD_ROOT;
  const candidates = await prisma.upload.findMany({
    where: {
      avatarForUser: null,
      imageForDish: null,
      pendingDeleteAt: { lte: now },
      referenceState: "PENDING_DELETE",
    },
    orderBy: { pendingDeleteAt: "asc" },
    select: { id: true, purpose: true, storageKey: true },
    take: 500,
  });
  const errors: unknown[] = [];
  let deleted = 0;

  for (const candidate of candidates) {
    const path = resolvedUploadPath(
      uploadRoot,
      candidate.purpose,
      candidate.storageKey,
    );
    try {
      try {
        await unlink(path);
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : undefined;
        if (code !== "ENOENT") {
          throw error;
        }
      }

      const result = await prisma.upload.deleteMany({
        where: {
          avatarForUser: null,
          id: candidate.id,
          imageForDish: null,
          pendingDeleteAt: { lte: now },
          referenceState: "PENDING_DELETE",
        },
      });
      deleted += result.count;
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more uploads could not be cleaned");
  }
  return { deleted };
}

export { resolvedUploadPath };
