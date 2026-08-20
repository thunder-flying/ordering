import { readFile } from "node:fs/promises";

import { env } from "../../../../lib/env";
import { ApiError } from "../../../../lib/http/api-error";
import { route } from "../../../../lib/http/handler";
import { prisma } from "../../../../lib/prisma";
import { verifySignedAvatarUrl } from "../../../../modules/uploads/signed-avatar-url";
import { resolvedUploadPath } from "../../../../modules/uploads/upload-service";

type AvatarMediaContext = {
  params: Promise<{ key: string }>;
};

const AVATAR_MEDIA_KEY = /^[a-f0-9]{36}\.(?:jpg|png|webp)$/;

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", "头像不存在或链接已失效", 404);
}

export const GET = route<AvatarMediaContext>(async (request, context) => {
  const { key } = await context.params;
  if (
    !AVATAR_MEDIA_KEY.test(key) ||
    !verifySignedAvatarUrl(
      key,
      request.nextUrl.searchParams.get("expires") ?? "",
      request.nextUrl.searchParams.get("signature") ?? "",
    )
  ) {
    throw notFound();
  }

  const upload = await prisma.upload.findFirst({
    where: {
      purpose: "AVATAR",
      referenceState: "REFERENCED",
      storageKey: key,
    },
    select: { detectedMediaType: true, storageKey: true },
  });
  if (!upload) throw notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(
      resolvedUploadPath(env.UPLOAD_ROOT, "AVATAR", upload.storageKey),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw notFound();
    }
    throw error;
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "cache-control": "private, no-store",
      "content-length": bytes.byteLength.toString(),
      "content-type": upload.detectedMediaType,
      "x-content-type-options": "nosniff",
    },
  });
});
