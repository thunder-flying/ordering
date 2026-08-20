import { apiFailure, apiSuccess } from "@ordering/contracts";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "../logging/logger";
import { normalizeError } from "./api-error";

export type RequestContext = {
  requestId: string;
};

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

function requestIdFor(request: NextRequest): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && SAFE_REQUEST_ID.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function route<TContext extends object = Record<string, never>>(
  handler: (
    request: NextRequest,
    context: RequestContext & TContext,
  ) => Promise<unknown>,
) {
  return async (request: NextRequest, nextContext?: unknown) => {
    const startedAt = performance.now();
    const requestId = requestIdFor(request);
    const pathname = request.nextUrl.pathname;

    try {
      const context = {
        ...(typeof nextContext === "object" && nextContext !== null
          ? nextContext
          : {}),
        requestId,
      } as RequestContext & TContext;
      const data = await handler(request, context);
      const response =
        data instanceof Response
          ? data
          : NextResponse.json(apiSuccess(data), {
              headers: { "x-request-id": requestId },
            });

      response.headers.set("x-request-id", requestId);
      logger.info(
        {
          duration: Math.round(performance.now() - startedAt),
          method: request.method,
          pathname,
          requestId,
          status: response.status,
        },
        "request completed",
      );
      return response;
    } catch (error) {
      const safe = normalizeError(error);
      logger.error(
        {
          code: safe.code,
          duration: Math.round(performance.now() - startedAt),
          method: request.method,
          pathname,
          requestId,
          status: safe.status,
          ...(safe.stack ? { stack: safe.stack } : {}),
        },
        "request failed",
      );
      return NextResponse.json(
        apiFailure(safe.code, safe.message, requestId),
        {
          headers: { "x-request-id": requestId },
          status: safe.status,
        },
      );
    }
  };
}
