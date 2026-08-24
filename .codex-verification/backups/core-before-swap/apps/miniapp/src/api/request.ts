import type { ApiResponse } from "@ordering/contracts";

import { toApiUrl } from "../config";
import { clearSession, ensureSession } from "../state/session";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ClientErrorDetails = {
  status: number;
  requestId?: string;
};

export class ClientError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(message: string, details: ClientErrorDetails) {
    super(message);
    this.name = "ClientError";
    this.status = details.status;
    this.requestId = details.requestId;
  }
}

export type RequestOptions = {
  method: Method;
  path: string;
  data?: unknown;
  idempotencyKey?: string;
};

export type UploadOptions = {
  path: string;
  filePath: string;
  name?: string;
  formData?: Record<string, string>;
  idempotencyKey?: string;
};

type Transport = (token: string) => Promise<unknown>;

function responseError(response: { data: unknown; header?: Record<string, string> }): ClientError | undefined {
  const body = response.data as ApiResponse<unknown>;
  if (body && typeof body.code === "number" && (body.code < 200 || body.code >= 300)) {
    const requestId = response.header?.["x-request-id"] ?? response.header?.["X-Request-Id"];
    return new ClientError(body.message, { status: body.code, ...(requestId ? { requestId } : {}) });
  }
  return undefined;
}

function callRequest<T>(options: RequestOptions, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: toApiUrl(options.path),
      method: options.method,
      data: options.data,
      header: {
        Authorization: `Bearer ${token}`,
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      success: (response) => {
        const error = responseError(response);
        if (error) return reject(error);
        resolve((response.data as ApiResponse<T>).data);
      },
      fail: reject,
    });
  });
}

function callUpload<T>(options: UploadOptions, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: toApiUrl(options.path),
      filePath: options.filePath,
      name: options.name ?? "file",
      formData: options.formData,
      header: {
        Authorization: `Bearer ${token}`,
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      success: (response) => {
        const parsed = JSON.parse(response.data) as ApiResponse<T>;
        if (parsed.code < 200 || parsed.code >= 300) {
          return reject(new ClientError(parsed.message, { status: parsed.code, ...(response.header?.["x-request-id"] ? { requestId: response.header["x-request-id"] } : {}) }));
        }
        resolve(parsed.data);
      },
      fail: reject,
    });
  });
}

async function withSingleReplay<T>(transport: Transport, canReplay: boolean): Promise<T> {
  const firstSession = await ensureSession();
  try {
    return (await transport(firstSession.token)) as T;
  } catch (error) {
    if (!(error instanceof ClientError) || error.status !== 401) throw error;
    clearSession();
    if (!canReplay) throw error;

    const nextSession = await ensureSession(true);
    return (await transport(nextSession.token)) as T;
  }
}

export function request<T>(options: RequestOptions): Promise<T> {
  toApiUrl(options.path);
  return withSingleReplay<T>(
    (token) => callRequest<T>(options, token),
    options.method === "GET" || Boolean(options.idempotencyKey),
  );
}

export function upload<T>(options: UploadOptions): Promise<T> {
  toApiUrl(options.path);
  return withSingleReplay<T>((token) => callUpload<T>(options, token), Boolean(options.idempotencyKey));
}
