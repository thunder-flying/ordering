import { readFile } from "node:fs/promises";

import { env } from "../../../../lib/env";
import { ApiError } from "../../../../lib/http/api-error";
import { route } from "../../../../lib/http/handler";
import { prisma } from "../../../../lib/prisma";
import { resolvedUploadPath } from "../../../../modules/uploads/upload-service";

type DishMediaContext = {
  params: Promise<{ key: string }>;
};

const DISH_MEDIA_KEY = /^[a-f0-9]{36}\.(?:jpg|png|webp)$/;

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", "图片不存在", 404);
}

export const GET = route<DishMediaContext>(async (_request, context) => {
  const { key } = await context.params;
  if (!DISH_MEDIA_KEY.test(key)) {
    throw notFound();
  }

  const upload = await prisma.upload.findFirst({
    where: { purpose: "DISH_IMAGE", storageKey: key },
    select: { detectedMediaType: true, storageKey: true },
  });
  if (!upload) {
    throw notFound();
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(
      resolvedUploadPath(env.UPLOAD_ROOT, "DISH_IMAGE", upload.storageKey),
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
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": bytes.byteLength.toString(),
      "content-type": upload.detectedMediaType,
      "x-content-type-options": "nosniff",
    },
  });
});
