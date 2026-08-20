import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError } from "./api-error";
import { route } from "./handler";
import { parseJson } from "./json";

function request(headers?: HeadersInit) {
  return new NextRequest("http://localhost/api/v1/test", {
    ...(headers ? { headers } : {}),
  });
}

describe("route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps an API error without leaking details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await route(async () => {
      throw new ApiError("VALIDATION_ERROR", "名称不能为空", 400);
    })(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "名称不能为空",
      },
    });
  });

  it("hides unexpected error messages and stack traces", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = await route(async () => {
      throw new Error("DATABASE_URL=mysql://secret");
    })(request());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("mysql://secret");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("mysql://secret");
  });

  it("replaces an unsafe incoming request ID", async () => {
    const response = await route(async (_request, context) => ({
      requestId: context.requestId,
    }))(request({ "x-request-id": "unsafe request id\r\n" }));
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({
      ok: true,
      data: { requestId },
    });
  });
});

describe("parseJson", () => {
  it("returns validated JSON", async () => {
    const schema = z.object({ name: z.string().min(1) });
    const input = new NextRequest("http://localhost/api/v1/test", {
      body: JSON.stringify({ name: "家常菜" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    await expect(parseJson(input, schema)).resolves.toEqual({ name: "家常菜" });
  });

  it("maps malformed JSON to a safe validation error", async () => {
    const input = new NextRequest("http://localhost/api/v1/test", {
      body: "{secret",
      method: "POST",
    });

    await expect(parseJson(input, z.object({}))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });
});
