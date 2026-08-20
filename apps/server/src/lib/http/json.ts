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

export function parseSearchParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodType<T>,
): T {
  try {
    return schema.parse(Object.fromEntries(searchParams));
  } catch {
    throw new ApiError(
      "VALIDATION_ERROR",
      "查询参数格式不正确",
      400,
    );
  }
}
