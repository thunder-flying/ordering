import type { ApiErrorCode, ApiResult } from "@ordering/contracts";

export class AdminApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
  }
}

export async function adminFetch<T>(
  pathname: string,
  init: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (csrfToken && init.method && !["GET", "HEAD"].includes(init.method)) {
    headers.set("x-csrf-token", csrfToken);
  }

  const response = await fetch(pathname, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  const payload = (await response.json()) as ApiResult<T>;
  if (!payload.ok) {
    throw new AdminApiError(
      payload.error.code,
      payload.error.message,
      response.status,
    );
  }
  return payload.data;
}
