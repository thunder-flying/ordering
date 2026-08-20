import type { z } from "zod";

import { ApiError } from "./api-error";

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  try {
    return schema.parse(await request.json());
  } catch {
    throw new ApiError(
      "VALIDATION_ERROR",
      "请求参数格式不正确",
      400,
    );
  }
}
