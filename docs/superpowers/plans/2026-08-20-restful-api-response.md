# `/api/v1` Unified REST Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every `/api/v1` JSON response in place to `{ code, message, data }` and fix the Next.js-safe local administrator password hash.

**Architecture:** Keep `route()` as the central success/error boundary, move the shared response type and builders into `@ordering/contracts`, and add a focused server helper for explicit status, header, and cookie responses. Update the seven routes that currently construct `NextResponse` directly; all other routes inherit the new shape from `route()`.

**Tech Stack:** Node.js 24, TypeScript 5.9, Next.js 16.3.1 App Router, React 19, Vitest 4, Zod 4, OpenAPI 3.1, pnpm 11.19.0.

**Spec:** `docs/superpowers/specs/2026-08-20-restful-api-response-design.md`

## Global Constraints

- Modify `/api/v1` in place; do not add `/api/v2` or a legacy-response compatibility mode.
- Every JSON body has exactly the top-level fields `code`, `message`, and `data`.
- Body `code` equals the real HTTP status.
- Successful bodies use `message: "success"`; failed bodies use `data: null`.
- Keep internal `ApiErrorCode` values in server logs, not in client JSON.
- Return request IDs through `X-Request-ID`, not through the JSON body.
- Preserve existing request DTOs, resource paths, authentication, authorization, database models, and successful business DTOs.
- Do not change `/media/*` binary responses.
- Do not start or restart a development server. Do not run Playwright because its global setup starts a Next.js development server.
- The repository `AGENTS.md` forbids every Git command. Replace commit steps with explicit review checkpoints; do not inspect, stage, commit, branch, or push with Git.

---

### Task 1: Make the local administrator hash safe for Next.js

**Files:**
- Modify: `apps/server/.env`
- Modify: `docs/runbooks/local-development.md`

**Interfaces:**
- Consumes: Next.js 16.3.1 `@next/env` loading behavior and the existing local Argon2id hash for password `123456`.
- Produces: A Next-loaded `ADMIN_PASSWORD_HASH` beginning with `$argon2id$`, plus a documented command that emits Next-safe escaped hashes.

- [ ] **Step 1: Reproduce the broken Next.js-loaded hash**

Run from `apps/server`:

```powershell
node --input-type=module -e 'import { createRequire } from "node:module"; import { resolve } from "node:path"; const require = createRequire(import.meta.url); const { loadEnvConfig } = require(resolve(process.cwd(), "../../node_modules/.pnpm/@next+env@16.3.1/node_modules/@next/env/dist/index.js")); delete process.env.ADMIN_PASSWORD_HASH; loadEnvConfig(process.cwd(), true); const value = process.env.ADMIN_PASSWORD_HASH ?? ""; console.log(value.startsWith("$argon2id$") ? "PASS" : "FAIL"); if (!value.startsWith("$argon2id$")) process.exit(1);'
```

Expected: exit code 1 and output `FAIL`, proving that raw dollar signs are expanded by Next.js.

- [ ] **Step 2: Escape every dollar sign in the actual local hash**

Change only this `.env` entry:

```dotenv
ADMIN_PASSWORD_HASH=\$argon2id\$v=19\$m=19456,t=2,p=1\$FFm7iE20Rzj9c9dT57QTlA\$o8TUvKqh5VRwteyAoWn6IGHdYV3Z3kEhCy/mKQxbAA8
```

Do not change `.env.example` to a real credential hash.

- [ ] **Step 3: Update the password-generation instructions**

In `docs/runbooks/local-development.md`, replace the hash-printing expression with a Next-safe form:

```powershell
pnpm --filter @ordering/server exec node --input-type=module -e "import { hash } from '@node-rs/argon2'; console.log((await hash(process.env.ORDERING_ADMIN_PASSWORD)).replaceAll('$', '\\$'))"
```

Add one sentence immediately after the command: Next.js expands unescaped `$NAME` references in `.env`, so the backslashes must remain in `ADMIN_PASSWORD_HASH`.

- [ ] **Step 4: Verify with Next's loader and Argon2**

Run from `apps/server`:

```powershell
node --input-type=module -e 'import { createRequire } from "node:module"; import { resolve } from "node:path"; import { verify } from "@node-rs/argon2"; const require = createRequire(import.meta.url); const { loadEnvConfig } = require(resolve(process.cwd(), "../../node_modules/.pnpm/@next+env@16.3.1/node_modules/@next/env/dist/index.js")); delete process.env.ADMIN_PASSWORD_HASH; loadEnvConfig(process.cwd(), true); const value = process.env.ADMIN_PASSWORD_HASH ?? ""; const valid = value.startsWith("$argon2id$") && await verify(value, "123456"); console.log(valid ? "PASS" : "FAIL"); if (!valid) process.exit(1);'
```

Expected: exit code 0 and output `PASS`.

- [ ] **Step 5: Review checkpoint**

Confirm that only `ADMIN_PASSWORD_HASH` changed in `.env`, the cleartext password was not written to a file, and no Git command was run.

---

### Task 2: Replace the shared response contract

**Files:**
- Modify: `packages/contracts/src/result.test.ts`
- Modify: `packages/contracts/src/result.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `ApiErrorCode` remains available separately for server-side error classification.
- Produces: `ApiResponse<T>`, `apiSuccess<T>(data: T, status?: number)`, and `apiFailure(status: number, message: string)`.

- [ ] **Step 1: Write failing contract tests**

Replace the result tests with these exact expectations:

```ts
import { describe, expect, it } from "vitest";

import { apiFailure, apiSuccess } from "./result";

describe("API response builders", () => {
  it("wraps a default 200 success response", () => {
    expect(apiSuccess({ id: "dish-1" })).toEqual({
      code: 200,
      message: "success",
      data: { id: "dish-1" },
    });
  });

  it("uses an explicit successful HTTP status", () => {
    expect(apiSuccess({ id: "dish-1" }, 201)).toEqual({
      code: 201,
      message: "success",
      data: { id: "dish-1" },
    });
  });

  it("uses the HTTP error status and null data", () => {
    expect(apiFailure(400, "名称不能为空")).toEqual({
      code: 400,
      message: "名称不能为空",
      data: null,
    });
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
pnpm --filter @ordering/contracts test -- src/result.test.ts
```

Expected: FAIL because the current implementation returns `ok/data` and `ok/error`.

- [ ] **Step 3: Implement the minimal shared contract**

Replace `packages/contracts/src/result.ts` with:

```ts
export type ApiResponse<T> =
  | {
      code: number;
      message: "success";
      data: T;
    }
  | {
      code: number;
      message: string;
      data: null;
    };

export function apiSuccess<T>(
  data: T,
  status = 200,
): ApiResponse<T> {
  return { code: status, message: "success", data };
}

export function apiFailure(
  status: number,
  message: string,
): ApiResponse<never> {
  return { code: status, message, data: null };
}
```

In `packages/contracts/src/index.ts`, replace the `ApiResult` type export with:

```ts
export type { ApiResponse } from "./result";
```

Keep the existing `apiFailure`, `apiSuccess`, and `ApiErrorCode` exports.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```powershell
pnpm --filter @ordering/contracts test -- src/result.test.ts
pnpm --filter @ordering/contracts typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Review checkpoint**

Search `packages/contracts/src` for `ApiResult`, `ok: true`, and `ok: false`. Expected: no response-contract remnants outside historical design documents; do not run Git.

---

### Task 3: Centralize explicit and implicit server responses

**Files:**
- Create: `apps/server/src/lib/http/response.ts`
- Create: `apps/server/src/lib/http/response.test.ts`
- Modify: `apps/server/src/lib/http/handler.ts`
- Modify: `apps/server/src/lib/http/handler.test.ts`

**Interfaces:**
- Consumes: `apiSuccess(data, status)` and `apiFailure(status, message)` from Task 2.
- Produces: `jsonSuccess<T>(data: T, init?: ResponseInit)`, `jsonFailure(status: number, message: string, init?: ResponseInit)`, and a `route()` boundary that wraps plain values with HTTP 200.

- [ ] **Step 1: Write failing response-helper tests**

Create `response.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { jsonFailure, jsonSuccess } from "./response";

describe("JSON response helpers", () => {
  it("derives the body code from a 201 response status", async () => {
    const response = jsonSuccess(
      { id: "dish-1" },
      { headers: { "x-test": "kept" }, status: 201 },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("kept");
    expect(await response.json()).toEqual({
      code: 201,
      message: "success",
      data: { id: "dish-1" },
    });
  });

  it("derives an error body from the supplied status", async () => {
    const response = jsonFailure(503, "服务暂时不可用");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 503,
      message: "服务暂时不可用",
      data: null,
    });
  });
});
```

- [ ] **Step 2: Update handler tests to the new contract**

Change the API-error assertion to:

```ts
expect(await response.json()).toEqual({
  code: 400,
  message: "名称不能为空",
  data: null,
});
```

Change the unexpected-error test to assert that the body contains `"code":500`, does not contain `INTERNAL_ERROR`, and still does not contain either secret string.

Change the unsafe request-ID success assertion to:

```ts
expect(await response.json()).toEqual({
  code: 200,
  message: "success",
  data: { requestId },
});
```

Add a test proving a safe incoming ID is echoed in the response header:

```ts
it("echoes a safe incoming request ID", async () => {
  const response = await route(async () => ({ success: true }))(
    request({ "x-request-id": "client-request-123" }),
  );

  expect(response.headers.get("x-request-id")).toBe("client-request-123");
});
```

- [ ] **Step 3: Run the HTTP tests and verify RED**

Run:

```powershell
pnpm --filter @ordering/server test -- src/lib/http/response.test.ts src/lib/http/handler.test.ts
```

Expected: FAIL because `response.ts` does not exist and `handler.ts` still emits the old envelope.

- [ ] **Step 4: Implement the response helpers**

Create `response.ts`:

```ts
import { apiFailure, apiSuccess, type ApiResponse } from "@ordering/contracts";
import { NextResponse } from "next/server";

export function jsonSuccess<T>(
  data: T,
  init: ResponseInit = {},
): NextResponse<ApiResponse<T>> {
  const status = init.status ?? 200;
  const responseInit = Object.assign({}, init, { status });
  return NextResponse.json(apiSuccess(data, status), responseInit);
}

export function jsonFailure(
  status: number,
  message: string,
  init: ResponseInit = {},
): NextResponse<ApiResponse<never>> {
  const responseInit = Object.assign({}, init, { status });
  return NextResponse.json(apiFailure(status, message), responseInit);
}
```

- [ ] **Step 5: Update the central handler**

In `handler.ts`:

- Keep `apiFailure`, `apiSuccess`, logging, safe request-ID validation, and `normalizeError` imports/behavior.
- Wrap a non-`Response` result with `NextResponse.json(apiSuccess(data, 200), { status: 200 })`.
- In the catch branch, call `apiFailure(safe.status, safe.message)`.
- Keep `safe.code` only in the log payload.
- Keep setting `X-Request-ID` after either an explicit or implicit response is built.

The catch response must be:

```ts
return NextResponse.json(apiFailure(safe.status, safe.message), {
  headers: { "x-request-id": requestId },
  status: safe.status,
});
```

- [ ] **Step 6: Run focused tests and type checking**

Run:

```powershell
pnpm --filter @ordering/server test -- src/lib/http/response.test.ts src/lib/http/handler.test.ts
pnpm --filter @ordering/server typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Review checkpoint**

Confirm that `jsonSuccess` and `jsonFailure` each derive status line and body code from one value, and that internal symbolic error codes remain in logs only.

---

### Task 4: Migrate explicit administrator responses

**Files:**
- Modify: `apps/server/src/app/api/v1/admin/categories/route.test.ts`
- Modify: `apps/server/src/app/api/v1/admin/categories/route.ts`
- Modify: `apps/server/src/app/api/v1/admin/dishes/route.test.ts`
- Modify: `apps/server/src/app/api/v1/admin/dishes/route.ts`
- Modify: `apps/server/src/app/api/v1/admin/session/route.test.ts`
- Modify: `apps/server/src/app/api/v1/admin/session/route.ts`
- Modify: `apps/server/src/app/api/v1/admin/uploads/dish-image/route.test.ts`
- Modify: `apps/server/src/app/api/v1/admin/uploads/dish-image/route.ts`

**Interfaces:**
- Consumes: `jsonSuccess` from Task 3 and the unchanged admin services.
- Produces: Admin create/upload responses with body code 201, plus session responses that retain hardened cookies.

- [ ] **Step 1: Strengthen the four admin route tests**

Add exact body assertions for category and dish creation:

```ts
expect(await response.json()).toEqual({
  code: 201,
  message: "success",
  data: { id: "category-1" },
});
```

```ts
expect(await response.json()).toEqual({
  code: 201,
  message: "success",
  data: { id: "dish-1" },
});
```

For upload, assert the complete mocked upload DTO under `data` with `code: 201` and `message: "success"`.

For session POST, use:

```ts
expect(await response.json()).toEqual({
  code: 200,
  message: "success",
  data: {
    csrfToken: "c".repeat(43),
    expiresAt: "2026-08-20T12:00:00.000Z",
  },
});
```

For session GET, use:

```ts
expect(await response.json()).toEqual({
  code: 200,
  message: "success",
  data: {
    csrfToken: "d".repeat(43),
    expiresAt: new Date(1_787_227_200 * 1_000).toISOString(),
  },
});
```

For session DELETE, use:

```ts
expect(await response.json()).toEqual({
  code: 200,
  message: "success",
  data: { success: true },
});
```

Keep all existing cookie assertions.

- [ ] **Step 2: Run the admin route tests and verify RED**

Run:

```powershell
pnpm --filter @ordering/server test -- src/app/api/v1/admin/categories/route.test.ts src/app/api/v1/admin/dishes/route.test.ts src/app/api/v1/admin/session/route.test.ts src/app/api/v1/admin/uploads/dish-image/route.test.ts
```

Expected: FAIL because the explicit routes still construct the old success envelope.

- [ ] **Step 3: Replace explicit route builders**

Remove `apiSuccess` and `NextResponse` imports from these four route files. Import `jsonSuccess` from the route's corresponding relative `lib/http/response` path.

Use these exact return forms:

```ts
return jsonSuccess(await createCategory(input), { status: 201 });
```

```ts
return jsonSuccess(await createDish(input), { status: 201 });
```

```ts
return jsonSuccess(await storeDishImage(files[0]), { status: 201 });
```

For session POST:

```ts
const response = jsonSuccess({
  csrfToken: session.csrf,
  expiresAt: session.expiresAt,
});
response.headers.append("set-cookie", session.cookie);
return response;
```

For session DELETE:

```ts
const response = jsonSuccess({ success: true as const });
response.headers.append("set-cookie", clearAdminCookie());
return response;
```

Leave session GET as a plain DTO so `route()` wraps it.

- [ ] **Step 4: Run the admin route tests**

Run the Step 2 command again.

Expected: all four test files pass and all cookie assertions remain green.

- [ ] **Step 5: Run the admin category update/delete route test**

Run:

```powershell
pnpm --filter @ordering/server test -- "src/app/api/v1/admin/categories/[categoryId]/route.test.ts"
```

Expected: PASS after updating any old envelope assertion in that test to `code/message/data`.

- [ ] **Step 6: Review checkpoint**

Search the four route source files for `apiSuccess` and `NextResponse`. Expected: no matches.

---

### Task 5: Migrate public, user, list, and health responses

**Files:**
- Modify: `apps/server/src/app/api/v1/lists/route.ts`
- Modify: `apps/server/src/app/api/v1/lists/[id]/copy/route.ts`
- Modify: `apps/server/src/app/api/v1/health/route.ts`
- Modify: `apps/server/src/app/api/v1/auth/logout/route.test.ts`
- Modify: `apps/server/src/app/api/v1/auth/wechat/route.test.ts`
- Modify: `apps/server/src/app/api/v1/dishes/route.test.ts`
- Modify: `apps/server/src/app/api/v1/favorites/[dishId]/route.test.ts`
- Modify: `apps/server/src/app/api/v1/health/route.test.ts`

**Interfaces:**
- Consumes: `jsonSuccess`, `jsonFailure`, and the Task 3 implicit `route()` wrapper.
- Produces: User-facing 200/201 responses in the new shape and a health failure represented as HTTP/body code 503 with null data.

- [ ] **Step 1: Change user-facing test expectations**

For logout, use:

```ts
expect(await response.json()).toEqual({
  code: 200,
  message: "success",
  data: { success: true },
});
```

For WeChat login, dishes, and favorites, replace the old `ok: true` assertion with `code: 200` and `message: "success"`, retaining each existing DTO under `data`.

For health success, use:

```ts
expect(await response.json()).toEqual({
  code: 200,
  message: "success",
  data: { status: "ok" },
});
```

For health failure, parse JSON and assert:

```ts
expect(await response.json()).toEqual({
  code: 503,
  message: "服务暂时不可用",
  data: null,
});
```

- [ ] **Step 2: Run the five route tests and verify RED**

Run:

```powershell
pnpm --filter @ordering/server test -- src/app/api/v1/auth/logout/route.test.ts src/app/api/v1/auth/wechat/route.test.ts src/app/api/v1/dishes/route.test.ts "src/app/api/v1/favorites/[dishId]/route.test.ts" src/app/api/v1/health/route.test.ts
```

Expected: FAIL until both implicit and health-specific response changes are present.

- [ ] **Step 3: Migrate the three remaining explicit route sources**

In `lists/route.ts`, replace the POST result with:

```ts
return jsonSuccess(await createList(userId, input), { status: 201 });
```

In `lists/[id]/copy/route.ts`, replace the POST result with:

```ts
return jsonSuccess(await copyList(userId, listId, input), { status: 201 });
```

In `health/route.ts`, keep the successful plain DTO and replace the catch return with:

```ts
return jsonFailure(503, "服务暂时不可用");
```

Remove `apiSuccess` and `NextResponse` imports from these files; import the focused helper or helpers from `lib/http/response`.

- [ ] **Step 4: Run all server unit tests**

Run:

```powershell
pnpm --filter @ordering/server test
```

Expected: all unit and route tests pass. If any old `ok/error` expectation fails, replace it with the approved `code/message/data` shape while preserving the original DTO.

- [ ] **Step 5: Perform an API source scan**

Run from the repository root:

```powershell
$legacy = Get-ChildItem -LiteralPath 'apps/server/src/app/api/v1' -Recurse -File -Include *.ts,*.tsx | Select-String -Pattern '\bapiSuccess\b|\bapiFailure\b|\bok:\s*(true|false)'
if ($legacy) { $legacy; exit 1 }
```

Expected: exit code 0 with no matches. Central builders remain only under `src/lib/http`.

- [ ] **Step 6: Review checkpoint**

Confirm that all seven formerly explicit JSON routes now use `jsonSuccess` or `jsonFailure`, while binary media routes remain untouched.

---

### Task 6: Migrate the administrator HTTP client

**Files:**
- Create: `apps/server/src/lib/admin-api.test.ts`
- Modify: `apps/server/src/lib/admin-api.ts`

**Interfaces:**
- Consumes: `ApiResponse<T>` from Task 2 and `X-Request-ID` from Task 3.
- Produces: `adminFetch<T>()` returning the successful `data`, plus `AdminApiError` with numeric `code`, HTTP `status`, and nullable `requestId`.

- [ ] **Step 1: Write failing client tests**

Create `admin-api.test.ts` with three cases:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { adminFetch, AdminApiError } from "./admin-api";

describe("adminFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data from a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        code: 200,
        message: "success",
        data: { id: "dish-1" },
      }),
      { status: 200 },
    )));

    await expect(adminFetch<{ id: string }>("/api/v1/admin/dishes"))
      .resolves.toEqual({ id: "dish-1" });
  });

  it("throws the safe message and request ID for an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        code: 401,
        message: "用户名或密码不正确",
        data: null,
      }),
      {
        headers: { "x-request-id": "request-401" },
        status: 401,
      },
    )));

    const error = await adminFetch("/api/v1/admin/session", { method: "POST" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      code: 401,
      message: "用户名或密码不正确",
      requestId: "request-401",
      status: 401,
    });
  });

  it("rejects a body code that disagrees with HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 200, message: "success", data: {} }),
      { status: 201 },
    )));

    await expect(adminFetch("/api/v1/admin/dishes"))
      .rejects.toMatchObject({
        message: "服务响应格式不正确",
        status: 201,
      });
  });
});
```

- [ ] **Step 2: Run the client test and verify RED**

Run:

```powershell
pnpm --filter @ordering/server test -- src/lib/admin-api.test.ts
```

Expected: FAIL because `admin-api.ts` imports `ApiResult` and expects `ok/error`.

- [ ] **Step 3: Implement strict parsing of the new response**

Change the import to `ApiResponse`. Extend `AdminApiError` with:

```ts
readonly code: number;
readonly requestId: string | null;
readonly status: number;
```

Use this constructor:

```ts
constructor(
  code: number,
  message: string,
  status: number,
  requestId: string | null,
) {
  super(message);
  this.name = "AdminApiError";
  this.code = code;
  this.status = status;
  this.requestId = requestId;
}
```

After `fetch`, parse `ApiResponse<T>`, read `response.headers.get("x-request-id")`, and apply these rules in order:

```ts
const payload = (await response.json()) as ApiResponse<T>;
const requestId = response.headers.get("x-request-id");
if (
  typeof payload.code !== "number" ||
  typeof payload.message !== "string" ||
  payload.code !== response.status
) {
  throw new AdminApiError(
    response.status,
    "服务响应格式不正确",
    response.status,
    requestId,
  );
}
if (!response.ok || payload.data === null) {
  throw new AdminApiError(
    payload.code,
    payload.message,
    response.status,
    requestId,
  );
}
return payload.data;
```

Keep content type, credentials, and CSRF header behavior unchanged.

- [ ] **Step 4: Run client tests, all unit tests, and type checking**

Run:

```powershell
pnpm --filter @ordering/server test -- src/lib/admin-api.test.ts
pnpm --filter @ordering/server test
pnpm --filter @ordering/server typecheck
```

Expected: all commands exit 0; login, logout, and CRUD components compile without per-component response parsing changes.

- [ ] **Step 5: Review checkpoint**

Search `apps/server/src` for `ApiResult`, `payload.ok`, and `payload.error`. Expected: no old client parsing remains.

---

### Task 7: Update OpenAPI and human-readable API documentation

**Files:**
- Modify: `docs/api/openapi.yaml`
- Modify: `docs/api/README.md`

**Interfaces:**
- Consumes: The approved runtime contract from Tasks 2 through 6.
- Produces: OpenAPI 3.1 schemas and documentation matching every runtime JSON response.

- [ ] **Step 1: Prove the OpenAPI still describes the old envelope**

Run:

```powershell
$old = Select-String -LiteralPath 'docs/api/openapi.yaml' -Pattern 'required: \[ok,|^\s+ok:|required: \[code, message, requestId\]|^\s+requestId:'
if ($old) { $old; exit 1 }
```

Expected: exit code 1 and matches for the old response schemas.

- [ ] **Step 2: Replace the common error schema**

Remove `ApiErrorCode` from the public OpenAPI schemas. Define `ErrorResponse` exactly as:

```yaml
    ErrorResponse:
      type: object
      additionalProperties: false
      required: [code, message, data]
      properties:
        code: { type: integer, minimum: 400, maximum: 599 }
        message: { type: string, minLength: 1, maxLength: 200 }
        data: { type: 'null' }
```

Keep the existing reusable 400/401/403/404/409/429/502/500 response components pointed at `ErrorResponse`. Add a reusable 503 response component if the health path does not already express it directly.

- [ ] **Step 3: Migrate every success response schema**

Each success response must require `[code, message, data]`, set `message` to `{ const: success, type: string }`, and keep its existing `data` schema. Use this complete status mapping:

| Schema | Allowed `code` values |
| --- | --- |
| `HealthResponse` | 200 |
| `ActionResponse` | 200 |
| `WechatLoginResponse` | 200 |
| `ProfileResponse` | 200 |
| `PublicCategoryListResponse` | 200 |
| `PublicDishPageResponse` | 200 |
| `DishAvailabilityResponse` | 200 |
| `FavoritePageResponse` | 200 |
| `FavoriteMutationResponse` | 200 |
| `SavedListPageResponse` | 200 |
| `SavedListDetailResponse` | 200, 201 |
| `CopyListResponse` | 201 |
| `AdminSessionResponse` | 200 |
| `AdminStatsResponse` | 200 |
| `AdminCategoryResponse` | 200, 201 |
| `AdminCategoryPageResponse` | 200 |
| `AdminDishResponse` | 200, 201 |
| `AdminDishPageResponse` | 200 |
| `UploadResponse` | 201 |

For a single status use:

```yaml
        code: { const: 200, type: integer }
        message: { const: success, type: string }
```

For more than one status use:

```yaml
        code: { type: integer, enum: [200, 201] }
        message: { const: success, type: string }
```

Health `data.status` must contain only `ok`; the 503 branch uses `ErrorResponse` with null data.

- [ ] **Step 4: Document `X-Request-ID`**

Add a reusable OpenAPI header:

```yaml
  headers:
    RequestId:
      description: 服务端采用或生成的请求链路标识
      schema: { type: string, minLength: 1, maxLength: 64 }
```

Reference it as `X-Request-ID` on all reusable error responses and every JSON success response. Do not add `requestId` back to any body schema.

- [ ] **Step 5: Update the API README**

Replace the basic response conventions with:

```markdown
- 成功响应示例：`{ "code": 200, "message": "success", "data": { "id": "dish-1" } }`。
- 失败响应示例：`{ "code": 401, "message": "用户名或密码不正确", "data": null }`。
- JSON 中的 `code` 与实际 HTTP 状态码一致；客户端不得假设所有请求都返回 HTTP 200。
- 每个响应通过 `X-Request-ID` 头返回请求链路标识，JSON 正文不包含请求 ID。
```

Update the error-code section so clients branch on HTTP/numeric `code`; state that symbolic codes remain internal server log fields.

- [ ] **Step 6: Verify documentation has no legacy response fields**

Run:

```powershell
$legacy = Select-String -LiteralPath 'docs/api/openapi.yaml','docs/api/README.md' -Pattern 'required: \[ok,|^\s+ok:|"ok"|required: \[code, message, requestId\]|^\s+requestId:'
if ($legacy) { $legacy; exit 1 }
```

Expected: exit code 0 with no matches.

- [ ] **Step 7: Review checkpoint**

Cross-check all 19 success response schemas and the common error schema against the status mapping. Confirm the media binary response schemas remain unchanged.

---

### Task 8: Run complete non-server-starting verification

**Files:**
- Verify only; modify a task-owned file only if a verification failure exposes a defect in that task.

**Interfaces:**
- Consumes: All deliverables from Tasks 1 through 7.
- Produces: Fresh evidence that contracts, unit tests, integration tests, lint, types, build, environment loading, and legacy-shape scans pass.

- [ ] **Step 1: Prepare the isolated integration-test database**

The integration helper refuses to reset any database except `ordering_test`. Create only that disposable database in the existing local Compose container, grant the existing development user access, and apply migrations:

```powershell
docker exec mysql-ordering mysql -uroot -p123456 -e "CREATE DATABASE IF NOT EXISTS ordering_test; GRANT ALL PRIVILEGES ON ordering_test.* TO 'ordering'@'%'; FLUSH PRIVILEGES;"
$env:DATABASE_URL='mysql://ordering:123456@127.0.0.1:33070/ordering_test'
pnpm --filter @ordering/server exec prisma migrate deploy
```

Expected: migration exits 0 against `ordering_test`. Never point integration tests at `ordering`; `resetTestDatabase` intentionally rejects it.

- [ ] **Step 2: Run the repository service verification gate**

With the Step 1 `DATABASE_URL` still set, run:

```powershell
pnpm verify:server
```

Expected: contract tests, server lint, type checking, unit tests, MySQL integration tests, and production build all exit 0. This command must not start `next dev`.

- [ ] **Step 3: Re-run the Next-loaded password verification**

Run the Task 1 Step 4 command from `apps/server`.

Expected: `PASS` with exit code 0.

- [ ] **Step 4: Scan source, tests, contracts, and API docs for the old envelope**

Run from the repository root:

```powershell
$paths = @('apps/server/src','packages/contracts/src','docs/api')
$legacy = Get-ChildItem -LiteralPath $paths -Recurse -File -Include *.ts,*.tsx,*.md,*.yaml | Select-String -Pattern '\bApiResult\b|\bok:\s*(true|false)|required: \[ok,|payload\.ok|payload\.error'
if ($legacy) { $legacy; exit 1 }
```

Expected: exit code 0 with no matches. If a non-response domain field named `ok` is found, narrow the scan only after manually proving it is unrelated to API envelopes.

- [ ] **Step 5: Verify route inventory and explicit builders**

Run:

```powershell
$routes = @(Get-ChildItem -LiteralPath 'apps/server/src/app/api/v1' -Recurse -File -Filter route.ts)
if ($routes.Count -ne 23) { throw "Expected 23 API routes, found $($routes.Count)" }
$legacyBuilders = $routes | Select-String -Pattern '\bapiSuccess\b|\bapiFailure\b'
if ($legacyBuilders) { $legacyBuilders; exit 1 }
Write-Output '23 routes checked; no legacy builders remain.'
```

Expected: `23 routes checked; no legacy builders remain.`

- [ ] **Step 6: Review the final evidence without Git**

Confirm:

- `pnpm verify:server` passed in full.
- Next's loader preserved the Argon2id hash and verified password `123456`.
- All legacy envelope scans passed.
- No development server or Playwright process was started.
- No Git command was run.

Record any verification command that could not run and its exact blocker; do not claim that blocked checks passed.
