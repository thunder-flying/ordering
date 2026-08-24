import type { ApiResponse } from "@ordering/contracts";

import { toApiUrl } from "../config";
import { clearSession, ensureSession } from "../state/session";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type ClientErrorDetails = { status: number; requestId?: string };
export class ClientError extends Error {
  readonly status: number; readonly requestId: string | undefined;
  constructor(message: string, details: ClientErrorDetails) { super(message); this.name = "ClientError"; this.status = details.status; this.requestId = details.requestId; }
}
export type RequestOptions = { method: Method; path: string; data?: unknown; idempotencyKey?: string; replaySafe?: boolean };
export type UploadOptions = { path: string; filePath: string; name?: string; formData?: Record<string, string>; idempotencyKey?: string };
type Transport = (token: string) => Promise<unknown>;
function responseError(response: { data: unknown; header?: Record<string, string> }): ClientError | undefined {
  const body = response.data as ApiResponse<unknown>;
  if (typeof body?.code === "number" && (body.code < 200 || body.code >= 300)) { const requestId = response.header?.["x-request-id"] ?? response.header?.["X-Request-Id"]; return new ClientError(body.message, { status: body.code, ...(requestId ? { requestId } : {}) }); }
  return undefined;
}
function headers(token: string, idempotencyKey?: string): Record<string, string> { return { Authorization: `Bearer ${token}`, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }; }
function callRequest<T>(options: RequestOptions, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({ url: toApiUrl(options.path), method: options.method as NonNullable<WechatMiniprogram.RequestOption["method"]>, header: headers(token, options.idempotencyKey), ...(options.data === undefined ? {} : { data: options.data as object }), success: (response) => { const error = responseError(response as { data: unknown; header?: Record<string, string> }); if (error) { reject(error); return; } const body = response.data as ApiResponse<T>; if (body.data === null) { reject(new ClientError("响应数据缺失", { status: body.code })); return; } resolve(body.data); }, fail: reject });
  });
}
function callUpload<T>(options: UploadOptions, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({ url: toApiUrl(options.path), filePath: options.filePath, name: options.name ?? "file", header: headers(token, options.idempotencyKey), ...(options.formData === undefined ? {} : { formData: options.formData }), success: (response) => { let body: ApiResponse<T>; try { body = JSON.parse(response.data) as ApiResponse<T>; } catch { reject(new ClientError("响应格式无效", { status: response.statusCode })); return; } if (body.code < 200 || body.code >= 300 || body.data === null) { reject(new ClientError(body.message, { status: body.code })); return; } resolve(body.data); }, fail: reject });
  });
}
async function withSingleReplay<T>(transport: Transport, canReplay: boolean): Promise<T> { const first = await ensureSession(); try { return (await transport(first.token)) as T; } catch (error) { if (!(error instanceof ClientError) || error.status !== 401) throw error; clearSession(); if (!canReplay) throw error; return (await transport((await ensureSession(true)).token)) as T; } }
export function request<T>(options: RequestOptions): Promise<T> { try { toApiUrl(options.path); } catch (error) { return Promise.reject(error); } return withSingleReplay<T>((token) => callRequest<T>(options, token), options.method === "GET" || Boolean(options.idempotencyKey) || options.replaySafe === true); }
export function upload<T>(options: UploadOptions): Promise<T> { try { toApiUrl(options.path); } catch (error) { return Promise.reject(error); } return withSingleReplay<T>((token) => callUpload<T>(options, token), Boolean(options.idempotencyKey)); }
