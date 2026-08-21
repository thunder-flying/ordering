import type { ApiResponse } from "@ordering/contracts";

export class AdminApiError extends Error {
  readonly code: number;
  readonly requestId: string | null;
  readonly status: number;

  constructor(
    code: number,
    message: string,
    status: number,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

function hasApiResponseShape(value: unknown): value is ApiResponse<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    Number.isInteger(value.code) &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    "data" in value
  );
}

function invalidResponse(response: Response, requestId: string | null) {
  return new AdminApiError(
    response.status,
    "服务响应格式不正确",
    response.status,
    requestId,
  );
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
  const requestId = response.headers.get("x-request-id");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponse(response, requestId);
  }

  if (!hasApiResponseShape(payload) || payload.code !== response.status) {
    throw invalidResponse(response, requestId);
  }

  if (!response.ok) {
    if (payload.data !== null || payload.message === "success") {
      throw invalidResponse(response, requestId);
    }
    throw new AdminApiError(
      payload.code,
      payload.message,
      response.status,
      requestId,
    );
  }

  if (payload.message !== "success") {
    throw invalidResponse(response, requestId);
  }
  return payload.data as T;
}
