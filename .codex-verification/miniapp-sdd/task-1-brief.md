# Task 1: Native shell, API result handling, and silent login

## Goal

Create the native WeChat Mini Program package and shell, including deterministic environment origins, a single authenticated request/upload client, versioned session storage, one-time silent relogin, and launch readiness.

## Files

- Create `apps/miniapp/package.json`
- Create `apps/miniapp/tsconfig.json`
- Create `apps/miniapp/project.config.json`
- Create `apps/miniapp/src/app.ts`
- Create `apps/miniapp/src/app.json`
- Create `apps/miniapp/src/app.wxss`
- Create `apps/miniapp/src/config.ts`
- Create `apps/miniapp/src/api/request.ts`
- Create `apps/miniapp/src/api/auth.ts`
- Create `apps/miniapp/src/state/session.ts`
- Create `apps/miniapp/src/utils/idempotency.ts`
- Test `apps/miniapp/tests/api/request.test.ts`
- Test `apps/miniapp/tests/state/session.test.ts`
- Update `pnpm-lock.yaml` and `.gitignore` only if required. `pnpm-workspace.yaml` already includes `apps/*`; leave it unchanged if package discovery works.

## Required package shape

Package name is `@ordering/miniapp`; scripts are `vitest run` and `tsc --noEmit`. Use TypeScript 5, Vitest 4, `miniprogram-api-typings`, and `miniprogram-simulate`, with `@ordering/contracts` as a workspace dependency.

`project.config.json` uses `appid: "touristappid"`, `miniprogramRoot: "src/"`, enables ES6/TypeScript compilation, and keeps URL checking enabled. The ignored real AppID belongs only in `project.private.config.json`.

## Native app shell

Register onboarding/detail pages and four tabs named exactly `选菜`, `当前清单`, `我的清单`, and `我的`. Use a neutral light window with `navigationBarTitleText: "我的选菜清单"` and lazy component loading. Do not register any share handler.

Global visual direction: a calm Chinese food-journal aesthetic—warm rice-paper neutrals, deep ink green, a restrained cinnabar accent, generous breathing room, readable Chinese typography, and 44px minimum interactive targets. Keep tokens in `app.wxss`; avoid purple gradients and generic dashboard styling.

## APIs and behavior

Produce:

```ts
export type StoredSession = {
  token: string;
  expiresAt: string;
  onboardingCompleted: boolean;
};

export async function ensureSession(force?: boolean): Promise<StoredSession>;
export function clearSession(): void;

export async function request<T>(options: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  data?: unknown;
  idempotencyKey?: string;
}): Promise<T>;

export async function upload<T>(options: {
  path: string;
  filePath: string;
  name?: string;
  formData?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<T>;

export function newIdempotencyKey(): string;
```

The implemented server response is `ApiResponse<T>` with numeric HTTP status in `code`, `message`, and `data`; terminal authentication is detected from HTTP status 401. Preserve safe server messages and request IDs in a typed client error.

Store the token under exactly one versioned session key with `wx.setStorageSync`, never log it, and remove it after terminal authentication failure or account deletion. Send it only to the configured origin. Avoid multiple simultaneous logins by sharing an in-flight login promise.

Environment origin selection is deterministic:

```ts
const API_ORIGINS = {
  develop: "http://127.0.0.1:3000",
  trial: "https://menu.example.com",
  release: "https://menu.example.com",
} as const;
```

No request may target an origin outside this allow-list, and request paths must be relative `/api/...` paths rather than arbitrary URLs.

On an unauthenticated response, relog once and replay a GET. Surface a second 401. Replay a mutation only when it has an idempotency key. Apply the same safety policy to upload.

`App.onLaunch` starts `ensureSession()`, publishes a readiness promise that always settles, lets pages handle a rejected readiness state, and redirects to onboarding only when the resolved session reports `onboardingCompleted: false`.

## Tests and TDD

Write tests before production modules. Watch focused tests fail because functionality is absent, then implement. Tests must cover:

- one-time relogin and replay for GET after 401;
- surfacing a second 401;
- refusing to replay a mutation without an idempotency key;
- replaying an idempotent mutation at most once;
- valid stored session reuse, expired/corrupt session replacement, shared concurrent login, and clearing terminal session state;
- origin/path enforcement and idempotency-key generation.

Run focused tests during red/green, then run the package tests and typecheck once at the end. Test real client/state behavior; mock only the external `wx` boundary.

## Global constraints

- Native Mini Program only: WXML, WXSS, TypeScript. No Taro, uni-app, React, React Native, or WebView UI.
- `WECHAT_APP_SECRET` must never exist in client code.
- Pages never call `wx.request` directly.
- Do not use `wx.getUserProfile`.
- UI language uses selection/list wording and never implies ordering, checkout, payment, fulfilment, merchant, table, pickup, or delivery.
- Do not execute any Git command and do not commit; root `AGENTS.md` forbids it for this request.

