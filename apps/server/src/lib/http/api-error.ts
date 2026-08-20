import type { ApiErrorCode } from "@ordering/contracts";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export type NormalizedError = {
  code: ApiErrorCode;
  message: string;
  status: number;
  stack?: string;
};

function stackFrames(error: Error): string | undefined {
  const frames = error.stack?.split("\n").slice(1, 21).join("\n").trim();
  return frames || undefined;
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  const stack = error instanceof Error ? stackFrames(error) : undefined;

  return {
    code: "INTERNAL_ERROR",
    message: "服务暂时不可用，请稍后重试",
    status: 500,
    ...(stack ? { stack } : {}),
  };
}
