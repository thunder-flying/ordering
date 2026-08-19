# Personal Menu Server and Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js modular monolith, MySQL data model, versioned API, and single-administrator React dashboard for the personal menu-list product.

**Architecture:** A pnpm workspace contains a shared API contract/validation package and one Next.js App Router application. Route Handlers call focused domain services, services use Prisma repositories, and all private queries derive ownership from authenticated sessions rather than request-supplied user IDs.

**Tech Stack:** Node.js 24 LTS, pnpm 10, TypeScript 5, Next.js 16, React 19, Prisma 7, MySQL 8.4, Zod 4, Vitest, Playwright, Docker Compose for the test database.

**Spec:** `docs/superpowers/specs/2026-08-19-personal-menu-list-design.md`

## Global Constraints

- The user client is a native WeChat Mini Program; React is used only by the Next.js administrator UI.
- All server-side behavior and administrator pages live in one deployable Next.js application.
- UI copy must use “选择”, “当前清单”, “保存清单”, “参考价格”, and “预估合计”; never introduce transaction or fulfilment language.
- No payment, orders, fulfilment, stores, tables, pickup codes, refunds, staff accounts, roles, sharing, collaboration, user-created dishes, inventory, SKU, coupons, or marketing.
- Prices are integer cents from 0 through 9,999,999; never use floating-point arithmetic for persistence or totals.
- Category names are 1–20 characters, dish names 1–40, dish descriptions at most 300, list names 1–40, quantities 1–99, and item notes at most 100 Unicode characters.
- Dish images accept JPEG, PNG, or WebP up to 5 MB; avatars accept JPEG, PNG, or WebP up to 2 MB.
- The database must not store plaintext `openid`; store a deterministic HMAC-SHA256 digest. Store only SHA-256 hashes of random user session tokens.
- User sessions last at most 30 days; administrator sessions last at most 12 hours.
- Administrator APIs never return a user list, profile, favorite detail, or personal-list detail.
- All package versions must be pinned by `pnpm-lock.yaml`; production upgrades are explicit, never automatic.

---

## File Map

Create these boundaries before feature work:

```text
package.json                         workspace commands only
pnpm-workspace.yaml                 workspace membership
tsconfig.base.json                  shared strict TypeScript options
.node-version                       Node 24
.gitignore                          secrets, builds, uploads, test artifacts
packages/contracts/src/             request/response types, Zod schemas, error codes
apps/server/src/app/                Next.js pages and Route Handlers
apps/server/src/modules/auth/       WeChat identity and user sessions
apps/server/src/modules/admin/      administrator session and aggregates
apps/server/src/modules/menu/       categories and dishes
apps/server/src/modules/favorites/  private favorite behavior
apps/server/src/modules/lists/      private list behavior and snapshots
apps/server/src/modules/profile/    nickname, avatar, clearing, deletion
apps/server/src/modules/uploads/    validated file persistence and signed URLs
apps/server/src/lib/                Prisma, HTTP envelope, crypto, logging, limits
apps/server/prisma/                  schema, migrations, seed
apps/server/tests/                   integration fixtures and API tests
deploy/docker-compose.test.yml      disposable MySQL for integration tests
```

Each Route Handler may parse HTTP and call one service. It must not contain Prisma queries or business calculations.

### Task 1: Workspace, contracts, and test runner

**Files:**
- Create: `.node-version`
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/errors.ts`
- Create: `packages/contracts/src/result.ts`
- Test: `packages/contracts/src/result.test.ts`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/next.config.ts`
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/src/app/layout.tsx`
- Create: `apps/server/src/app/page.tsx`

**Interfaces:**
- Produces: `ApiResult<T>`, `ApiErrorCode`, `apiSuccess<T>()`, and `apiFailure()` for every later task.

- [ ] **Step 1: Create the workspace and pin the toolchain**

```json
// package.json
{
  "name": "personal-menu-list",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

Set `.node-version` to `24`. Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` in `tsconfig.base.json`. Ignore `.env*` except `.env.example`, `.next`, `node_modules`, `coverage`, `test-results`, `playwright-report`, and `var/uploads`.

- [ ] **Step 2: Install pinned major versions and generate the lockfile**

Run:

```powershell
corepack enable
pnpm --filter @ordering/server add next@16 react@19 react-dom@19 zod@4
pnpm --filter @ordering/server add -D typescript@5 vitest@4 @types/node@24 @types/react@19 @types/react-dom@19 eslint eslint-config-next@16
pnpm --filter @ordering/contracts add zod@4
pnpm --filter @ordering/contracts add -D typescript@5 vitest@4
```

Expected: `pnpm-lock.yaml` exists and `pnpm install --frozen-lockfile` succeeds.

- [ ] **Step 3: Write the failing API-result contract test**

```ts
import { describe, expect, it } from "vitest";
import { apiFailure, apiSuccess } from "./result";

describe("API result envelope", () => {
  it("uses stable discriminants", () => {
    expect(apiSuccess({ id: "x" })).toEqual({ ok: true, data: { id: "x" } });
    expect(apiFailure("VALIDATION_ERROR", "名称不能为空", "req-1")).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "名称不能为空", requestId: "req-1" },
    });
  });
});
```

- [ ] **Step 4: Verify the test fails, then implement the contracts**

Run: `pnpm --filter @ordering/contracts test`

Expected first result: FAIL because `result.ts` exports do not exist.

```ts
export type ApiErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND"
  | "CONFLICT" | "RATE_LIMITED" | "WECHAT_UNAVAILABLE" | "INTERNAL_ERROR";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string; requestId: string } };

export const apiSuccess = <T>(data: T): ApiResult<T> => ({ ok: true, data });
export const apiFailure = (code: ApiErrorCode, message: string, requestId: string): ApiResult<never> =>
  ({ ok: false, error: { code, message, requestId } });
```

- [ ] **Step 5: Add the minimal Next.js shell and run all checks**

Create a root layout with Chinese metadata and a landing page that redirects to `/admin/login`. Run:

```powershell
pnpm test
pnpm typecheck
pnpm --filter @ordering/server build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add .node-version .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json packages apps/server
git commit -m "build: initialize Next.js workspace and API contracts"
```

### Task 2: MySQL schema and Prisma boundary

**Files:**
- Modify: `apps/server/package.json`
- Create: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/seed.ts`
- Create: `apps/server/src/lib/prisma.ts`
- Create: `apps/server/src/lib/env.ts`
- Create: `apps/server/.env.example`
- Create: `deploy/docker-compose.test.yml`
- Test: `apps/server/tests/database/schema.int.test.ts`
- Create: `apps/server/tests/helpers/database.ts`

**Interfaces:**
- Produces: singleton `prisma`, validated `env`, and all model names used by later repositories.

- [ ] **Step 1: Add Prisma, MySQL, and environment dependencies**

```powershell
pnpm --filter @ordering/server add @prisma/client@7 prisma@7 server-only
pnpm --filter @ordering/server add -D tsx
```

- [ ] **Step 2: Define the complete schema and test MySQL**

Use `cuid()` primary keys, cascading deletes for user-owned rows, and restrictive deletes for menu references. Required models are `User`, `UserSession`, `Category`, `Dish`, `Favorite`, `SavedList`, `ListItem`, and `Upload`. Enforce these database constraints:

```prisma
model Favorite {
  id        String   @id @default(cuid())
  userId    String
  dishId    String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  dish      Dish     @relation(fields: [dishId], references: [id], onDelete: Restrict)
  @@unique([userId, dishId])
  @@index([dishId])
}

model SavedList {
  id             String     @id @default(cuid())
  userId         String
  name           String     @db.VarChar(40)
  totalCents     Int
  idempotencyKey String     @db.VarChar(64)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  user           User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  items          ListItem[]
  @@unique([userId, idempotencyKey])
  @@index([userId, updatedAt])
}
```

`ListItem.dishId` is nullable with `onDelete: SetNull`; snapshot name, price, quantity, note, and position are required. `User.openidDigest` is unique and `User.onboardingCompletedAt` is nullable until the user saves or skips the first-entry profile screen. `UserSession.tokenHash` is unique and indexed with `expiresAt`. `Category` and `Dish` contain `enabled/published`, `sortOrder`, `deletedAt`, `createdAt`, and `updatedAt`. `Upload` records purpose, nullable owner user ID with `onDelete: SetNull`, storage key, media type, byte size, SHA-256, reference state, `pendingDeleteAt`, and creation time.

- [ ] **Step 3: Start the disposable database and create the first migration**

```yaml
services:
  mysql-test:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: ordering_test
      MYSQL_USER: ordering
      MYSQL_PASSWORD: ordering_test_password
      MYSQL_ROOT_PASSWORD: root_test_password
    ports:
      - "33070:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 2s
      timeout: 2s
      retries: 30
```

Run:

```powershell
docker compose -f deploy/docker-compose.test.yml up -d
$env:DATABASE_URL='mysql://ordering:ordering_test_password@127.0.0.1:33070/ordering_test'
pnpm --filter @ordering/server prisma migrate dev --name init
```

Expected: migration succeeds and Prisma Client generates.

- [ ] **Step 4: Write and run the schema constraint test**

```ts
it("rejects duplicate favorites for one user", async () => {
  const { user, dish } = await seedUserAndDish();
  await prisma.favorite.create({ data: { userId: user.id, dishId: dish.id } });
  await expect(prisma.favorite.create({ data: { userId: user.id, dishId: dish.id } }))
    .rejects.toMatchObject({ code: "P2002" });
});
```

Run: `pnpm --filter @ordering/server test:integration -- schema.int.test.ts`

Expected: PASS against MySQL 8.4.

- [ ] **Step 5: Add validated environment loading and the Prisma singleton**

```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  OPENID_HMAC_SECRET: z.string().min(32),
  WECHAT_APP_ID: z.string().min(1),
  WECHAT_APP_SECRET: z.string().min(1),
  USER_SESSION_PEPPER: z.string().min(32),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  ADMIN_SESSION_SECRET: z.string().min(32),
  UPLOAD_ROOT: z.string().min(1),
});
export const env = EnvSchema.parse(process.env);
```

Never import `env.ts` into a Client Component.

- [ ] **Step 6: Run checks and commit**

```powershell
pnpm --filter @ordering/server prisma validate
pnpm --filter @ordering/server test:integration
pnpm typecheck
git add apps/server deploy/docker-compose.test.yml
git commit -m "feat: add MySQL schema and Prisma foundation"
```

### Task 3: HTTP envelope, validation, logging, and request limits

**Files:**
- Create: `apps/server/src/lib/http/api-error.ts`
- Create: `apps/server/src/lib/http/handler.ts`
- Create: `apps/server/src/lib/http/json.ts`
- Create: `apps/server/src/lib/logging/logger.ts`
- Create: `apps/server/src/lib/security/rate-limit.ts`
- Test: `apps/server/src/lib/http/handler.test.ts`
- Test: `apps/server/src/lib/security/rate-limit.test.ts`
- Create: `apps/server/src/app/api/v1/health/route.ts`

**Interfaces:**
- Produces: `ApiError`, `route(handler)`, `parseJson(request, schema)`, `checkRateLimit(key, rule)`, and request-scoped sanitized logging.

- [ ] **Step 1: Write failing handler tests**

```ts
it("maps a validation exception without leaking details", async () => {
  const response = await route(async () => { throw new ApiError("VALIDATION_ERROR", "名称不能为空", 400); })(request());
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", message: "名称不能为空" } });
});
```

- [ ] **Step 2: Implement the route wrapper**

```ts
export const route = (handler: (request: NextRequest, context: RequestContext) => Promise<unknown>) =>
  async (request: NextRequest) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      return NextResponse.json(apiSuccess(await handler(request, { requestId })), { headers: { "x-request-id": requestId } });
    } catch (error) {
      const safe = normalizeError(error);
      logger.error({ requestId, code: safe.code }, "request failed");
      return NextResponse.json(apiFailure(safe.code, safe.message, requestId), { status: safe.status });
    }
  };
```

The logger allow-list is `requestId`, method, pathname, status, duration, error code, and internal stack in server output. It must drop authorization headers, cookies, request bodies, nickname, `openid`, and secrets.

- [ ] **Step 3: Implement and test a fixed-window in-process limiter**

```ts
export type RateRule = { limit: number; windowMs: number };
export function checkRateLimit(key: string, rule: RateRule, now = Date.now()): void;
```

Test that the 11th request fails for `{ limit: 10, windowMs: 60_000 }` and that the counter resets after the window. This complements Nginx limits; it is not the sole production defense.

- [ ] **Step 4: Add the health route**

`GET /api/v1/health` runs `SELECT 1`, returns `{ status: "ok" }`, and returns 503 with `{ status: "unavailable" }` when MySQL is unavailable. It never returns versions, connection strings, environment names, or stack traces.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm --filter @ordering/server test -- src/lib/http src/lib/security
pnpm typecheck
git add apps/server/src/lib apps/server/src/app/api/v1/health
git commit -m "feat: add safe HTTP and request infrastructure"
```

### Task 4: WeChat login and revocable user sessions

**Files:**
- Create: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/server/src/modules/auth/wechat-client.ts`
- Create: `apps/server/src/modules/auth/session-service.ts`
- Create: `apps/server/src/modules/auth/require-user.ts`
- Create: `apps/server/src/app/api/v1/auth/wechat/route.ts`
- Create: `apps/server/src/app/api/v1/auth/logout/route.ts`
- Test: `apps/server/src/modules/auth/wechat-client.test.ts`
- Test: `apps/server/tests/auth/session.int.test.ts`

**Interfaces:**
- Consumes: `prisma`, `env`, `route`, `parseJson`.
- Produces: `exchangeCode(code): Promise<{ openid: string }>`, `createUserSession(code): Promise<AuthSessionDto>`, and `requireUser(request): Promise<{ userId: string; sessionId: string }>`.

- [ ] **Step 1: Define the contract and failing WeChat-client test**

```ts
export const WechatLoginRequest = z.object({ code: z.string().min(1).max(128) });
export type AuthSessionDto = {
  token: string;
  expiresAt: string;
  profileComplete: boolean;
  onboardingCompleted: boolean;
};
```

Mock `fetch` and assert the client calls `https://api.weixin.qq.com/sns/jscode2session` with `appid`, `secret`, `js_code`, and `grant_type=authorization_code`. An `errcode` response must become `WECHAT_UNAVAILABLE`, never expose the secret or upstream body.

- [ ] **Step 2: Implement identity and token hashing**

```ts
const digestOpenid = (openid: string) =>
  createHmac("sha256", env.OPENID_HMAC_SECRET).update(openid).digest("base64url");
const issueToken = () => randomBytes(32).toString("base64url");
const hashToken = (token: string) =>
  createHash("sha256").update(`${token}.${env.USER_SESSION_PEPPER}`).digest("base64url");
```

Upsert by `openidDigest`, update `lastLoginAt`, create a 30-day `UserSession`, and return the raw token once. Do not persist or log the plaintext `openid` or token.

- [ ] **Step 3: Implement bearer authentication and logout**

`requireUser()` accepts exactly `Authorization: Bearer <token>`, hashes it, loads an unexpired session and user, and otherwise throws `UNAUTHENTICATED`. Logout deletes only the current session.

- [ ] **Step 4: Run isolation and expiry integration tests**

```ts
it("rejects an expired session", async () => {
  const token = await seedSession({ expiresAt: new Date(Date.now() - 1) });
  await expect(requireUser(requestWithBearer(token))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
```

Also assert that the database value differs from the returned token and that repeated WeChat login maps to the same active user.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm --filter @ordering/server test -- src/modules/auth
pnpm --filter @ordering/server test:integration -- auth
pnpm typecheck
git add packages/contracts apps/server/src/modules/auth apps/server/src/app/api/v1/auth
git commit -m "feat: add WeChat login and user sessions"
```

### Task 5: Administrator authentication

**Files:**
- Create: `packages/contracts/src/admin-auth.ts`
- Create: `apps/server/src/modules/admin/admin-session.ts`
- Create: `apps/server/src/modules/admin/require-admin.ts`
- Create: `apps/server/src/app/api/v1/admin/session/route.ts`
- Test: `apps/server/src/modules/admin/admin-session.test.ts`

**Interfaces:**
- Produces: `createAdminCookie(username, password)`, `requireAdmin(request)`, and `clearAdminCookie()`.

- [ ] **Step 1: Add password and JWE dependencies, then write failing tests**

```powershell
pnpm --filter @ordering/server add jose@6 @node-rs/argon2
```

Tests must assert correct credentials create a cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and `Max-Age=43200`; incorrect credentials return the same generic message and are limited to 5 attempts per 15 minutes per IP-and-username key.

- [ ] **Step 2: Implement password verification and encrypted cookie claims**

```ts
type AdminClaims = { sub: "single-admin"; exp: number; csrf: string };
export async function createAdminSession(username: string, password: string): Promise<{ cookie: string; csrf: string }>;
export async function requireAdmin(request: NextRequest): Promise<AdminClaims>;
```

Verify `ADMIN_PASSWORD_HASH` with Argon2id. Encrypt and authenticate claims using `jose` and `ADMIN_SESSION_SECRET`. Mutating admin routes require both a valid cookie and matching `x-csrf-token`; also reject an unexpected `Origin`.

- [ ] **Step 3: Implement login, current-session, and logout methods**

Use `POST`, `GET`, and `DELETE` on `/api/v1/admin/session`. The login response returns only `{ csrfToken, expiresAt }`. Logout expires the cookie.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm --filter @ordering/server test -- src/modules/admin/admin-session.test.ts
pnpm typecheck
git add packages/contracts apps/server/src/modules/admin apps/server/src/app/api/v1/admin/session apps/server/package.json pnpm-lock.yaml
git commit -m "feat: secure the single administrator session"
```

### Task 6: Public menu and category administration

**Files:**
- Create: `packages/contracts/src/menu.ts`
- Create: `apps/server/src/modules/menu/category-service.ts`
- Create: `apps/server/src/modules/menu/menu-query.ts`
- Create: `apps/server/src/app/api/v1/categories/route.ts`
- Create: `apps/server/src/app/api/v1/dishes/route.ts`
- Create: `apps/server/src/app/api/v1/dishes/availability/route.ts`
- Create: `apps/server/src/app/api/v1/admin/categories/route.ts`
- Create: `apps/server/src/app/api/v1/admin/categories/[id]/route.ts`
- Test: `apps/server/tests/menu/categories.int.test.ts`
- Test: `apps/server/tests/menu/public-menu.int.test.ts`

**Interfaces:**
- Produces: `listPublicCategories()`, `searchPublicDishes(query)`, `resolveDishAvailability(ids)`, and category administrator commands.

- [ ] **Step 1: Define exact menu schemas and write failing filter tests**

```ts
export const CategoryInput = z.object({
  name: z.string().trim().min(1).max(20),
  sortOrder: z.number().int().min(0).max(9999),
  enabled: z.boolean(),
});
export const DishSearch = z.object({
  q: z.string().trim().max(40).default(""),
  categoryId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

Test that disabled/deleted categories and unpublished/deleted dishes never appear in public results and that search matches a trimmed name substring.

- [ ] **Step 2: Implement category commands in transactions**

Create, edit, enable/disable, reorder, and soft-delete. Soft-delete must return `CONFLICT` when any non-deleted dish references the category. Disabling a category makes every child dish unavailable to public queries without mutating each dish.

- [ ] **Step 3: Implement cursor-based public reads**

Return only IDs, category ID, name, description, public dish-image URL, integer `referencePriceCents`, and sort order. Order by category sort, dish sort, then ID for stable pagination.

`POST /api/v1/dishes/availability` accepts 1–100 unique dish IDs and returns each current public dish record or `{ dishId, available: false }`. The current-list page uses it to refresh prices and availability without depending on search pagination.

- [ ] **Step 4: Add routes, run tests, and commit**

```powershell
pnpm --filter @ordering/server test:integration -- menu
pnpm typecheck
git add packages/contracts apps/server/src/modules/menu apps/server/src/app/api/v1/categories apps/server/src/app/api/v1/dishes apps/server/src/app/api/v1/admin/categories
git commit -m "feat: add public menu and category management"
```

### Task 7: Validated uploads and dish administration

**Files:**
- Create: `packages/contracts/src/dishes.ts`
- Create: `apps/server/src/modules/uploads/file-inspector.ts`
- Create: `apps/server/src/modules/uploads/upload-service.ts`
- Create: `apps/server/src/modules/uploads/signed-avatar-url.ts`
- Create: `apps/server/src/cli/cleanup-uploads.ts`
- Create: `apps/server/tsconfig.cli.json`
- Create: `apps/server/src/modules/menu/dish-service.ts`
- Create: `apps/server/src/app/api/v1/admin/uploads/dish-image/route.ts`
- Create: `apps/server/src/app/api/v1/admin/dishes/route.ts`
- Create: `apps/server/src/app/api/v1/admin/dishes/[id]/route.ts`
- Create: `apps/server/src/app/media/dishes/[key]/route.ts`
- Test: `apps/server/src/modules/uploads/file-inspector.test.ts`
- Test: `apps/server/tests/menu/dishes.int.test.ts`

**Interfaces:**
- Produces: `storeDishImage(file)`, `cleanupExpiredUploads(now)`, `createDish(input)`, `updateDish(id, input, expectedUpdatedAt)`, `softDeleteDish(id)`, and public dish media reads.

- [ ] **Step 1: Add file-signature dependency and failing tests**

```powershell
pnpm --filter @ordering/server add file-type@21
```

Create fixtures containing a valid 1-pixel PNG, a text file renamed `.png`, and a byte array over 5 MB. Assert only the valid PNG is accepted.

- [ ] **Step 2: Implement safe file persistence**

Read the stream with a hard byte cap, detect actual media type, compute SHA-256, generate a random storage key, write to `UPLOAD_ROOT/dishes`, and create `Upload` only after the atomic file move succeeds. Never use the client filename as a path.

```ts
export type StoredUpload = { id: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; bytes: number };
export async function storeDishImage(file: File): Promise<StoredUpload>;
```

- [ ] **Step 3: Implement dish validation and optimistic concurrency**

```ts
export const DishInput = z.object({
  categoryId: z.string().cuid(),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(300),
  referencePriceCents: z.number().int().min(0).max(9_999_999),
  imageUploadId: z.string().cuid(),
  sortOrder: z.number().int().min(0).max(9999),
  published: z.boolean(),
  expectedUpdatedAt: z.string().datetime().optional(),
});
```

Updates with a stale timestamp return `CONFLICT`. Replacement images enter a 7-day grace state; cleanup deletes only unreferenced, expired uploads. Soft-deleted dishes remain available to historical list joins but not public searches.

Compile `src/cli/cleanup-uploads.ts` with the server build. The command calls `cleanupExpiredUploads(new Date())`, limits one run to 500 records, verifies every resolved path stays under `UPLOAD_ROOT`, deletes the file first, then deletes its pending database row. A missing file is treated as already removed; any other filesystem error leaves the row for retry and exits nonzero.

- [ ] **Step 4: Add routes and integration tests**

Test create, update, conflict, publish/unpublish, soft-delete, category-disabled visibility, malicious upload rejection, and no orphan database row after a failed file write.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm --filter @ordering/server test -- src/modules/uploads
pnpm --filter @ordering/server test:integration -- dishes
pnpm typecheck
git add packages/contracts apps/server/src/modules/uploads apps/server/src/modules/menu apps/server/src/app/api/v1/admin apps/server/src/app/media apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add safe dish media and dish management"
```

### Task 8: Private favorites

**Files:**
- Create: `packages/contracts/src/favorites.ts`
- Create: `apps/server/src/modules/favorites/favorite-service.ts`
- Create: `apps/server/src/app/api/v1/favorites/route.ts`
- Create: `apps/server/src/app/api/v1/favorites/[dishId]/route.ts`
- Test: `apps/server/tests/favorites/favorites.int.test.ts`

**Interfaces:**
- Produces: `listFavorites(userId)`, `addFavorite(userId, dishId)`, and `removeFavorite(userId, dishId)`.

- [ ] **Step 1: Write failing ownership and idempotency tests**

Assert a second `PUT` for the same favorite remains successful with one row, a second `DELETE` remains successful, user A never sees user B’s favorite, and unpublished dishes are omitted from the active favorite response.

- [ ] **Step 2: Implement service and routes**

```ts
export async function addFavorite(userId: string, dishId: string): Promise<{ dishId: string; favorited: true }>;
export async function removeFavorite(userId: string, dishId: string): Promise<{ dishId: string; favorited: false }>;
```

Use `requireUser()` in every route and never read `userId` from query, body, or path.

- [ ] **Step 3: Verify and commit**

```powershell
pnpm --filter @ordering/server test:integration -- favorites
pnpm typecheck
git add packages/contracts apps/server/src/modules/favorites apps/server/src/app/api/v1/favorites
git commit -m "feat: add isolated user favorites"
```

### Task 9: Saved lists, snapshots, and idempotency

**Files:**
- Create: `packages/contracts/src/lists.ts`
- Create: `apps/server/src/modules/lists/list-calculator.ts`
- Create: `apps/server/src/modules/lists/list-service.ts`
- Create: `apps/server/src/app/api/v1/lists/route.ts`
- Create: `apps/server/src/app/api/v1/lists/[id]/route.ts`
- Create: `apps/server/src/app/api/v1/lists/[id]/copy/route.ts`
- Test: `apps/server/src/modules/lists/list-calculator.test.ts`
- Test: `apps/server/tests/lists/lists.int.test.ts`

**Interfaces:**
- Produces: `createList(userId, input)`, `updateList(userId, id, input)`, `copyList(userId, id, idempotencyKey)`, `getList(userId, id)`, `listLists(userId)`, and `deleteList(userId, id)`.

- [ ] **Step 1: Define list input and write the failing calculator test**

```ts
export const SaveListInput = z.object({
  name: z.string().trim().min(1).max(40),
  idempotencyKey: z.string().uuid(),
  items: z.array(z.object({
    dishId: z.string().cuid(),
    quantity: z.number().int().min(1).max(99),
    note: z.string().trim().max(100),
  })).min(1).max(100),
});
export const UpdateListInput = SaveListInput.extend({ expectedUpdatedAt: z.string().datetime() });
```

Test `[{ price: 1299, quantity: 2 }, { price: 500, quantity: 3 }]` equals `4098` and that duplicate dish IDs are rejected rather than silently double-counted.

- [ ] **Step 2: Implement transactional create and update**

Load all dishes and parent categories in one query. Reject missing, unpublished, deleted, or category-disabled items. Calculate with server prices and write `SavedList` plus ordered snapshot items in one transaction. If `(userId, idempotencyKey)` exists, return that existing list.

- [ ] **Step 3: Implement strict ownership**

Every detail, edit, copy, and delete query includes both `id` and `userId`. Return `NOT_FOUND` for both nonexistent and foreign IDs so ownership cannot be inferred.

- [ ] **Step 4: Implement edit and copy semantics**

Editing first returns the current list when its stored idempotency key matches the retry key; otherwise it compares `expectedUpdatedAt`, replaces items transactionally, records current names/prices, and stores the new idempotency key. Copy includes only currently available dishes, uses current prices, returns `skippedItemNames`, and fails with `CONFLICT` if no item remains.

- [ ] **Step 5: Run full list tests**

Cover price spoofing, old snapshot stability, current-price edit, unavailable dish rejection, copy skips, retry idempotency, empty list, max quantity, 101 items, and cross-user ID attacks.

- [ ] **Step 6: Commit**

```powershell
pnpm --filter @ordering/server test -- src/modules/lists
pnpm --filter @ordering/server test:integration -- lists
pnpm typecheck
git add packages/contracts apps/server/src/modules/lists apps/server/src/app/api/v1/lists
git commit -m "feat: add private saved lists and price snapshots"
```

### Task 10: Optional profile, avatar, clear-data, and account deletion

**Files:**
- Create: `packages/contracts/src/profile.ts`
- Create: `apps/server/src/modules/profile/profile-service.ts`
- Create: `apps/server/src/modules/uploads/avatar-service.ts`
- Create: `apps/server/src/app/api/v1/profile/route.ts`
- Create: `apps/server/src/app/api/v1/profile/avatar/route.ts`
- Create: `apps/server/src/app/api/v1/profile/onboarding/complete/route.ts`
- Create: `apps/server/src/app/api/v1/profile/clear-data/route.ts`
- Create: `apps/server/src/app/api/v1/profile/account/route.ts`
- Test: `apps/server/tests/profile/profile.int.test.ts`
- Test: `apps/server/src/modules/uploads/signed-avatar-url.test.ts`

**Interfaces:**
- Produces: `getProfile(userId)`, `updateNickname(userId, nickname)`, `replaceAvatar(userId, file)`, `completeOnboarding(userId)`, `clearPrivateData(userId)`, and `deleteAccount(userId)`.

- [ ] **Step 1: Define optional profile contracts and signed URL tests**

Nickname input is 1–40 trimmed characters when supplied. The default profile uses `nickname: "微信用户"`, `avatarUrl: null`, `profileComplete: false`, and `onboardingCompleted: false`. Assert an avatar URL signature expires after 10 minutes and cannot be used for another upload key.

```ts
export type ProfileDto = {
  nickname: string;
  avatarUrl: string | null;
  profileComplete: boolean;
  onboardingCompleted: boolean;
};
```

- [ ] **Step 2: Implement avatar validation and replacement**

Use the same actual-file detection as dish images with a 2 MB limit. Store under `UPLOAD_ROOT/avatars`, bind the upload to `userId`, atomically replace the reference, and delete the old file only after the transaction succeeds.

- [ ] **Step 3: Implement privacy mutations**

`completeOnboarding()` idempotently sets `onboardingCompletedAt` whether the user saved a profile or skipped. `clearPrivateData()` transactionally deletes favorites and lists but preserves the user, sessions, nickname, avatar, and onboarding state. `deleteAccount()` transactionally marks the avatar `Upload.pendingDeleteAt`, detaches it, deletes sessions, favorites, list items/lists, the user row, and `openidDigest`, then attempts physical removal. A failed removal remains discoverable by the 7-day orphan cleanup, so deletion does not lose the only file reference.

- [ ] **Step 4: Test and commit**

```powershell
pnpm --filter @ordering/server test -- signed-avatar-url
pnpm --filter @ordering/server test:integration -- profile
pnpm typecheck
git add packages/contracts apps/server/src/modules/profile apps/server/src/modules/uploads apps/server/src/app/api/v1/profile
git commit -m "feat: add optional profiles and privacy controls"
```

### Task 11: Anonymous administrator statistics

**Files:**
- Create: `packages/contracts/src/stats.ts`
- Create: `apps/server/src/modules/admin/stats-service.ts`
- Create: `apps/server/src/app/api/v1/admin/stats/route.ts`
- Test: `apps/server/tests/admin/stats.int.test.ts`

**Interfaces:**
- Produces: `getAdminStats(): Promise<AdminStatsDto>` containing only aggregate counts and dish-level popularity.

- [ ] **Step 1: Write the privacy-shape test**

```ts
expect(Object.keys(result).sort()).toEqual([
  "activeUsers7d", "favoriteCount", "listCount", "topDishes", "userCount",
]);
expect(JSON.stringify(result)).not.toMatch(/openid|nickname|avatar|userId|listName/i);
```

- [ ] **Step 2: Implement aggregate queries**

Count current users, users with `lastLoginAt >= now - 7 days`, favorites, and lists. Return at most 10 dishes with `{ dishId, dishName, favoriteCount }`, ordered by favorite count then dish ID. Do not query list items or profile fields.

- [ ] **Step 3: Verify and commit**

```powershell
pnpm --filter @ordering/server test:integration -- admin/stats
pnpm typecheck
git add packages/contracts apps/server/src/modules/admin apps/server/src/app/api/v1/admin/stats
git commit -m "feat: add privacy-preserving admin statistics"
```

### Task 12: React administrator UI

**Files:**
- Create: `apps/server/src/app/admin/login/page.tsx`
- Create: `apps/server/src/app/admin/(protected)/layout.tsx`
- Create: `apps/server/src/app/admin/(protected)/page.tsx`
- Create: `apps/server/src/app/admin/(protected)/categories/page.tsx`
- Create: `apps/server/src/app/admin/(protected)/dishes/page.tsx`
- Create: `apps/server/src/components/admin/admin-shell.tsx`
- Create: `apps/server/src/components/admin/category-form.tsx`
- Create: `apps/server/src/components/admin/dish-form.tsx`
- Create: `apps/server/src/components/admin/confirm-dialog.tsx`
- Create: `apps/server/src/lib/admin-api.ts`
- Create: `apps/server/src/app/admin/admin.css`
- Create: `apps/server/playwright.config.ts`
- Test: `apps/server/tests/e2e/admin-login.spec.ts`
- Test: `apps/server/tests/e2e/admin-menu.spec.ts`

**Interfaces:**
- Consumes: administrator session, stats, category, dish, and upload APIs.
- Produces: accessible administrator pages with no user-detail route.

- [ ] **Step 1: Add Playwright and write the failing login journey**

```powershell
pnpm --filter @ordering/server add -D @playwright/test
pnpm --filter @ordering/server exec playwright install chromium
```

```ts
test("administrator signs in and sees aggregate cards", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("管理员账号").fill("admin");
  await page.getByLabel("密码").fill("test-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "数据概览" })).toBeVisible();
  await expect(page.getByText("近 7 日活跃用户")) .toBeVisible();
});
```

- [ ] **Step 2: Implement the login and protected shell**

Use labeled fields, keyboard-visible focus, pending/error states, and server-side redirect when the cookie is absent or invalid. Store the CSRF token only in page memory and include it in every mutating administrator request.

- [ ] **Step 3: Implement dashboard and category management**

Dashboard renders the five allowed aggregate sections. Category page supports create, edit, ordering, enable/disable, and confirmed delete; a conflict explains that dishes must first be moved or deleted.

- [ ] **Step 4: Implement dish and image management**

Dish page supports search, category filter, form validation matching contract limits, preview/upload, integer-cent conversion from a two-decimal display input, publish/unpublish, optimistic conflict refresh, and confirmed soft-delete.

- [ ] **Step 5: Run accessibility-oriented E2E tests**

Test keyboard submit, invalid field summaries, failed login, expired session redirect, category CRUD, dish CRUD, upload rejection, publish toggle, stale edit conflict, and absence of any user-list navigation.

- [ ] **Step 6: Verify and commit**

```powershell
pnpm --filter @ordering/server test:e2e
pnpm --filter @ordering/server lint
pnpm --filter @ordering/server typecheck
pnpm --filter @ordering/server build
git add apps/server
git commit -m "feat: build the React administrator dashboard"
```

### Task 13: Server acceptance suite and operator documentation

**Files:**
- Create: `apps/server/tests/acceptance/server-acceptance.int.test.ts`
- Create: `apps/server/README.md`
- Create: `docs/runbooks/local-development.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: every server task.
- Produces: one reproducible server verification command and local setup documentation.

- [ ] **Step 1: Add an end-to-end API acceptance test**

The test seeds an administrator category and two dishes, logs in two mocked WeChat users, verifies menu visibility, creates distinct favorites and lists, spoofs a price, changes the real price, verifies the old snapshot, edits using the new price, disables a category, verifies public disappearance, clears user A’s data, and verifies user B remains unchanged.

- [ ] **Step 2: Add deterministic verification scripts**

```json
{
  "scripts": {
    "verify:server": "pnpm --filter @ordering/contracts test && pnpm --filter @ordering/server lint && pnpm --filter @ordering/server typecheck && pnpm --filter @ordering/server test && pnpm --filter @ordering/server test:integration && pnpm --filter @ordering/server build"
  }
}
```

- [ ] **Step 3: Document exact local startup**

Document Node 24, Corepack, test MySQL startup, `.env` creation from `.env.example`, Prisma migration, optional seed, Next.js dev server, test commands, and how to generate an Argon2id administrator password hash without recording the plaintext password in shell history.

- [ ] **Step 4: Run the full gate**

Run:

```powershell
docker compose -f deploy/docker-compose.test.yml up -d
pnpm install --frozen-lockfile
pnpm verify:server
```

Expected: every test and build exits 0. Inspect the test database to confirm no plaintext `openid` or session token exists.

- [ ] **Step 5: Commit**

```powershell
git add package.json apps/server docs/runbooks/local-development.md
git commit -m "test: complete server acceptance coverage"
```

## Server Plan Completion Gate

Before starting the Mini Program plan, require all of the following:

- `pnpm verify:server` passes from a clean install.
- The administrator can manage categories, dishes, images, and publication state in Chromium.
- Two simulated users cannot access one another’s favorites, lists, profiles, avatars, or IDs.
- No response or log contains plaintext `openid`, user session token, AppSecret, administrator password, or database URL.
- The API contract package is committed and is the only source of shared DTO and error-code names.
