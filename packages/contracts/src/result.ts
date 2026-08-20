import type { ApiErrorCode } from "./errors";

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ApiErrorCode;
        message: string;
        requestId: string;
      };
    };

export function apiSuccess<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function apiFailure(
  code: ApiErrorCode,
  message: string,
  requestId: string,
): ApiResult<never> {
  return {
    ok: false,
    error: { code, message, requestId },
  };
}
