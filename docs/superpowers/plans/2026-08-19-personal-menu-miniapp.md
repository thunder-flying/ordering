# Personal Menu Native Mini Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the native WeChat Mini Program that performs silent login, optional profile onboarding, public-menu browsing, private favorites, local draft selection, and private saved-list management.

**Architecture:** Native pages and components use WXML, WXSS, and TypeScript. A single authenticated API client owns token storage and one-time relogin, while small state modules own the local draft and current profile; pages never call `wx.request` directly.

**Tech Stack:** WeChat Mini Program native runtime, TypeScript 5, WeChat Developer Tools, `miniprogram-api-typings`, Vitest for pure modules, `miniprogram-simulate` for component tests.

**Spec:** `docs/superpowers/specs/2026-08-19-personal-menu-list-design.md`

**Prerequisite Plan:** `docs/superpowers/plans/2026-08-19-personal-menu-server.md` must pass its completion gate and expose the committed `@ordering/contracts` DTOs.

## Global Constraints

- Use native Mini Program pages and components only; do not add Taro, uni-app, React, React Native, or a WebView UI.
- Run `wx.login` before private API use. `WECHAT_APP_SECRET` must never exist in this application or any checked-in client file.
- First account entry opens profile onboarding immediately after silent login; choosing avatar/nickname is optional and “暂时跳过” grants full access.
- Use `button open-type="chooseAvatar"` and `input type="nickname"`; do not use `wx.getUserProfile` for a real profile.
- Every user sees the same published public menu; favorites, draft, lists, avatar, and profile are private.
- UI copy must use “选择”, “当前清单”, “保存清单”, “参考价格”, and “预估合计”; never display order, checkout, payment, merchant, table, pickup, delivery, or fulfilment actions.
- A draft item has only `dishId`, quantity 1–99, and a free note of at most 100 characters.
- Saved-list names are 1–40 characters. Display prices from integer cents using formatting, never floating-point totals.
- The current unsaved draft is local; favorites and saved lists are server-backed.
- No share menu, collaboration entry, public user profile, user-created dish, or administrator entry appears in the Mini Program.

---

## File Map

```text
apps/miniapp/project.config.json             checked-in tourist development config
apps/miniapp/project.private.config.json     ignored real AppID/devtool preferences
apps/miniapp/src/app.ts                      launch bootstrap only
apps/miniapp/src/app.json                    pages, tab bar, window policy
apps/miniapp/src/app.wxss                    tokens and global accessibility styles
apps/miniapp/src/config.ts                   API URL selection by envVersion
apps/miniapp/src/api/                         request, auth, profile, menu, favorite, list clients
apps/miniapp/src/state/                       session and local draft ownership
apps/miniapp/src/utils/                       price, validation, dates, idempotency key
apps/miniapp/src/components/                  reusable visual units
apps/miniapp/src/pages/onboarding/            optional first-entry profile flow
apps/miniapp/src/pages/menu/                  category/search/menu browser
apps/miniapp/src/pages/current-list/          local draft editor and save flow
apps/miniapp/src/pages/lists/                 saved-list index
apps/miniapp/src/pages/list-detail/           view/edit/copy/delete
apps/miniapp/src/pages/favorites/             active favorites
apps/miniapp/src/pages/profile/               profile and privacy controls
apps/miniapp/tests/                           pure module and component tests
docs/runbooks/miniapp-development.md          Developer Tools and real-device workflow
```

Pages consume typed API modules and state modules. They do not construct Authorization headers, format cents, or mutate storage keys themselves.

### Task 1: Native shell, API result handling, and silent login

**Files:**
- Create: `apps/miniapp/package.json`
- Create: `apps/miniapp/tsconfig.json`
- Create: `apps/miniapp/project.config.json`
- Create: `apps/miniapp/src/app.ts`
- Create: `apps/miniapp/src/app.json`
- Create: `apps/miniapp/src/app.wxss`
- Create: `apps/miniapp/src/config.ts`
- Create: `apps/miniapp/src/api/request.ts`
- Create: `apps/miniapp/src/api/auth.ts`
- Create: `apps/miniapp/src/state/session.ts`
- Create: `apps/miniapp/src/utils/idempotency.ts`
- Test: `apps/miniapp/tests/api/request.test.ts`
- Test: `apps/miniapp/tests/state/session.test.ts`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: type-only DTOs and runtime error codes from `@ordering/contracts`.
- Produces: `request<T>()`, `upload<T>()`, `ensureSession()`, `clearSession()`, and `newIdempotencyKey()`.

- [ ] **Step 1: Create the package and native project configuration**

```json
{
  "name": "@ordering/miniapp",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "miniprogram-api-typings": "latest",
    "miniprogram-simulate": "latest",
    "typescript": "5",
    "vitest": "4"
  }
}
```

Pin resolved versions in `pnpm-lock.yaml`. Set `project.config.json` to `appid: "touristappid"`, `miniprogramRoot: "src/"`, ES6/TypeScript compilation enabled, and URL checking enabled by default. Ignore `project.private.config.json`.

- [ ] **Step 2: Register pages and four-tab navigation**

`app.json` registers onboarding and detail pages plus tabs named `选菜`, `当前清单`, `我的清单`, and `我的`. Do not register a share handler. Set a neutral light window, `navigationBarTitleText: "我的选菜清单"`, and lazy component loading.

- [ ] **Step 3: Write failing request and relogin tests**

```ts
it("relogs once after UNAUTHENTICATED and replays a read", async () => {
  wxRequest.mockResolvedValueOnce(failure("UNAUTHENTICATED")).mockResolvedValueOnce(success({ items: [] }));
  wxLogin.mockResolvedValue({ code: "fresh-code" });
  await expect(request({ method: "GET", path: "/api/v1/dishes" })).resolves.toEqual({ items: [] });
  expect(wxLogin).toHaveBeenCalledTimes(1);
  expect(wxRequest).toHaveBeenCalledTimes(2);
});
```

Also test that a second unauthorized response is surfaced and a mutation is replayed only when it carries an idempotency key.

- [ ] **Step 4: Implement session storage and authenticated requests**

```ts
export type StoredSession = { token: string; expiresAt: string; onboardingCompleted: boolean };
export async function ensureSession(force?: boolean): Promise<StoredSession>;
export async function request<T>(options: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  data?: unknown;
  idempotencyKey?: string;
}): Promise<T>;
```

Store the token under one versioned key using `wx.setStorageSync`, never log it, send it only to the configured HTTPS origin, and remove it after a terminal authentication error or account deletion.

- [ ] **Step 5: Add deterministic environment URL selection**

```ts
const API_ORIGINS = {
  develop: "http://127.0.0.1:3000",
  trial: "https://menu.example.com",
  release: "https://menu.example.com",
} as const;
export const API_ORIGIN = API_ORIGINS[wx.getAccountInfoSync().miniProgram.envVersion];
```

The deployment plan replaces both HTTPS example origins with the purchased, ICP-filed domain before trial upload. No API request may target an origin outside this allow-list.

- [ ] **Step 6: Bootstrap without blocking page rendering forever**

`App.onLaunch` starts `ensureSession()`, publishes a resolved/rejected readiness promise, and lets pages show a retry state when login fails. Do not navigate to onboarding until the session response reports `onboardingCompleted: false`.

- [ ] **Step 7: Verify and commit**

```powershell
pnpm --filter @ordering/miniapp test
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp pnpm-workspace.yaml pnpm-lock.yaml .gitignore
git commit -m "feat: initialize native mini program and silent login"
```

### Task 2: First-entry profile onboarding

**Files:**
- Create: `apps/miniapp/src/api/profile.ts`
- Create: `apps/miniapp/src/state/profile.ts`
- Create: `apps/miniapp/src/pages/onboarding/index.json`
- Create: `apps/miniapp/src/pages/onboarding/index.wxml`
- Create: `apps/miniapp/src/pages/onboarding/index.wxss`
- Create: `apps/miniapp/src/pages/onboarding/index.ts`
- Create: `apps/miniapp/src/components/avatar-picker/index.json`
- Create: `apps/miniapp/src/components/avatar-picker/index.wxml`
- Create: `apps/miniapp/src/components/avatar-picker/index.wxss`
- Create: `apps/miniapp/src/components/avatar-picker/index.ts`
- Test: `apps/miniapp/tests/components/avatar-picker.test.ts`
- Test: `apps/miniapp/tests/pages/onboarding.test.ts`

**Interfaces:**
- Consumes: `ensureSession()`, profile API DTOs, `upload<T>()`.
- Produces: `loadProfile()`, `saveNickname()`, `saveAvatar()`, `completeOnboarding()`, and the optional onboarding page.

- [ ] **Step 1: Verify the server onboarding contract before UI work**

Run the server contract and profile tests and confirm `AuthSessionDto.onboardingCompleted`, `ProfileDto.onboardingCompleted`, and `POST /api/v1/profile/onboarding/complete` exist. Do not start the page against a locally invented response shape.

- [ ] **Step 2: Write failing avatar-picker tests**

The component must render a `button` with `open-type="chooseAvatar"`, emit the temporary path from `bindchooseavatar`, render an `input` with `type="nickname"`, enforce 40 characters, and never invoke `wx.getUserProfile`.

- [ ] **Step 3: Implement the onboarding state machine**

```ts
type OnboardingState = "loading" | "editing" | "saving" | "failed";
type OnboardingDraft = { nickname: string; avatarTempPath: string | null };
```

Load the current profile. “保存并进入” is enabled when both an avatar and a non-empty nickname are selected; it uploads the avatar, saves the nickname, marks onboarding complete, updates stored session state, and switches to the menu tab. `profileComplete` is true only when both saved fields exist. “暂时跳过” only marks onboarding complete and enters the menu. Failure keeps the draft and presents retry.

- [ ] **Step 4: Implement accessible WXML**

Use visible text labels, a default local avatar, 44 px minimum tap targets, a primary `保存并进入` button, and a secondary `暂时跳过` button. Explain in one sentence that the information is optional and used only for the user’s own profile.

- [ ] **Step 5: Test save, skip, and failure paths**

Assert skip performs no avatar upload, save without changes remains allowed only as skip, a failed upload does not mark onboarding complete, and reopening after completion does not redirect back.

- [ ] **Step 6: Commit**

```powershell
pnpm --filter @ordering/miniapp test -- onboarding avatar-picker
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp
git commit -m "feat: add optional first-entry profile onboarding"
```

### Task 3: Public menu, categories, search, and dish cards

**Files:**
- Create: `apps/miniapp/src/api/menu.ts`
- Create: `apps/miniapp/src/utils/price.ts`
- Create: `apps/miniapp/src/components/dish-card/index.json`
- Create: `apps/miniapp/src/components/dish-card/index.wxml`
- Create: `apps/miniapp/src/components/dish-card/index.wxss`
- Create: `apps/miniapp/src/components/dish-card/index.ts`
- Create: `apps/miniapp/src/components/status-view/index.json`
- Create: `apps/miniapp/src/components/status-view/index.wxml`
- Create: `apps/miniapp/src/components/status-view/index.wxss`
- Create: `apps/miniapp/src/components/status-view/index.ts`
- Create: `apps/miniapp/src/pages/menu/index.json`
- Create: `apps/miniapp/src/pages/menu/index.wxml`
- Create: `apps/miniapp/src/pages/menu/index.wxss`
- Create: `apps/miniapp/src/pages/menu/index.ts`
- Test: `apps/miniapp/tests/utils/price.test.ts`
- Test: `apps/miniapp/tests/components/dish-card.test.ts`

**Interfaces:**
- Produces: `formatCents(cents): string`, `fetchCategories()`, `fetchDishes(query)`, and `dish-card` events `favoritechange` and `add`.

- [ ] **Step 1: Write price-format tests before implementation**

```ts
expect(formatCents(0)).toBe("¥0.00");
expect(formatCents(5)).toBe("¥0.05");
expect(formatCents(1299)).toBe("¥12.99");
expect(formatCents(9_999_999)).toBe("¥99,999.99");
```

Implement using integer quotient/remainder and string grouping, not `cents / 100` arithmetic for totals.

- [ ] **Step 2: Build the dish card**

Properties are typed dish DTO plus `favorited`. Render lazy image with local fallback, name, description, `参考价格`, favorite button with state text, and `加入选择` button. Emit IDs only; do not own API or draft state.

- [ ] **Step 3: Build category and search behavior**

Load categories and the first dish page together. Category selection resets cursor. Search trims input, waits 300 ms after the last keystroke, cancels stale response application with a monotonically increasing request number, and loads up to 20 items per page.

- [ ] **Step 4: Add all page states**

Implement skeleton loading, empty menu, empty search, recoverable network error, image fallback, pull-to-refresh, and cursor pagination. Preserve the chosen category and search string when returning from another tab during the same app session.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm --filter @ordering/miniapp test -- price dish-card
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp/src/api/menu.ts apps/miniapp/src/utils apps/miniapp/src/components apps/miniapp/src/pages/menu apps/miniapp/tests
git commit -m "feat: add public menu browsing and search"
```

### Task 4: Private favorites

**Files:**
- Create: `apps/miniapp/src/api/favorites.ts`
- Create: `apps/miniapp/src/state/favorites.ts`
- Create: `apps/miniapp/src/pages/favorites/index.json`
- Create: `apps/miniapp/src/pages/favorites/index.wxml`
- Create: `apps/miniapp/src/pages/favorites/index.wxss`
- Create: `apps/miniapp/src/pages/favorites/index.ts`
- Modify: `apps/miniapp/src/pages/menu/index.ts`
- Test: `apps/miniapp/tests/state/favorites.test.ts`

**Interfaces:**
- Produces: `loadFavorites()`, `isFavorite(dishId)`, and `setFavorite(dishId, desired)` with optimistic rollback.

- [ ] **Step 1: Write optimistic-state tests**

Test immediate local toggle, successful confirmation, rollback after API failure, and serializing two rapid taps so the final desired state wins.

- [ ] **Step 2: Implement the favorite state module**

```ts
export type FavoriteState = { ids: Set<string>; loaded: boolean; pending: Set<string> };
export async function setFavorite(dishId: string, desired: boolean): Promise<void>;
```

Use idempotent `PUT` and `DELETE`. The module owns pending state; dish cards disable only their own favorite control while a request is active.

- [ ] **Step 3: Implement favorites page and menu integration**

The page lists active favorite dishes, supports removing a favorite, adding it to the draft, and shows a clear empty state. Unpublished dishes omitted by the server are not shown as errors.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --filter @ordering/miniapp test -- favorites
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp
git commit -m "feat: add private favorite management"
```

### Task 5: Local current-list draft

**Files:**
- Create: `apps/miniapp/src/state/draft.ts`
- Create: `apps/miniapp/src/utils/list-validation.ts`
- Create: `apps/miniapp/src/components/quantity-stepper/index.json`
- Create: `apps/miniapp/src/components/quantity-stepper/index.wxml`
- Create: `apps/miniapp/src/components/quantity-stepper/index.wxss`
- Create: `apps/miniapp/src/components/quantity-stepper/index.ts`
- Create: `apps/miniapp/src/pages/current-list/index.json`
- Create: `apps/miniapp/src/pages/current-list/index.wxml`
- Create: `apps/miniapp/src/pages/current-list/index.wxss`
- Create: `apps/miniapp/src/pages/current-list/index.ts`
- Modify: `apps/miniapp/src/pages/menu/index.ts`
- Test: `apps/miniapp/tests/state/draft.test.ts`
- Test: `apps/miniapp/tests/components/quantity-stepper.test.ts`

**Interfaces:**
- Produces: `getDraft()`, `addDish()`, `setQuantity()`, `setNote()`, `removeDish()`, `replaceDraft()`, `clearDraft()`, and `calculateDraftTotalCents()`.

- [ ] **Step 1: Write persistence and integer-total tests**

```ts
addDish({ dishId: "a", name: "菜 A", referencePriceCents: 1299, imageUrl: null });
setQuantity("a", 2);
setNote("a", "少辣");
expect(calculateDraftTotalCents()).toBe(2598);
expect(readStoredDraft().items[0]).toMatchObject({ quantity: 2, note: "少辣" });
```

Test clamping/rejection at 0 and 100, duplicate add increments up to 99, and corrupt storage resets safely.

- [ ] **Step 2: Implement a versioned local-storage schema**

```ts
type Draft = {
  version: 1;
  name: string;
  items: Array<{ dishId: string; name: string; imageUrl: string | null; referencePriceCents: number; quantity: number; note: string }>;
  editTarget: null | { listId: string; expectedUpdatedAt: string };
  mutationKey: string;
  updatedAt: string;
};
```

Persist after each mutation under `ordering:draft:v1`. Never store session tokens inside the draft.

- [ ] **Step 3: Build the current-list page**

Render item image/name, reference price, stepper, remove action, 100-character note input with count, list-name input, and sticky `预估合计`. Empty state links back to `选菜`. Save remains disabled until a valid name and at least one item exist.

- [ ] **Step 4: Refresh prices and availability before save**

On page show, compare draft IDs with the current menu response. Mark unavailable items, update visible current reference prices, and require removal of unavailable items. Do not silently delete them.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm --filter @ordering/miniapp test -- draft quantity-stepper
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp
git commit -m "feat: add persistent current-list draft"
```

### Task 6: Save, view, edit, copy, and delete lists

**Files:**
- Create: `apps/miniapp/src/api/lists.ts`
- Create: `apps/miniapp/src/pages/lists/index.json`
- Create: `apps/miniapp/src/pages/lists/index.wxml`
- Create: `apps/miniapp/src/pages/lists/index.wxss`
- Create: `apps/miniapp/src/pages/lists/index.ts`
- Create: `apps/miniapp/src/pages/list-detail/index.json`
- Create: `apps/miniapp/src/pages/list-detail/index.wxml`
- Create: `apps/miniapp/src/pages/list-detail/index.wxss`
- Create: `apps/miniapp/src/pages/list-detail/index.ts`
- Modify: `apps/miniapp/src/pages/current-list/index.ts`
- Test: `apps/miniapp/tests/pages/list-save.test.ts`
- Test: `apps/miniapp/tests/pages/list-detail.test.ts`

**Interfaces:**
- Consumes: list APIs and draft state.
- Produces: saved-list index/detail flows and a reliable save operation.

- [ ] **Step 1: Write the save-retry test**

Use the draft `mutationKey` for create or edit. Retain it through a timeout/retry and regenerate it whenever the user changes name, items, quantities, or notes. Assert two taps during pending state cause one request.

- [ ] **Step 2: Implement save from the current draft**

For a new draft, `POST` name, idempotency key, dish ID, quantity, and note. For an edit target, `PATCH` the same fields plus `expectedUpdatedAt` to that list ID. Ignore client price when constructing either request. On success clear the local draft, show `清单已保存`, and navigate to the returned detail. On failure preserve every draft field; a conflict offers reload instead of overwriting.

- [ ] **Step 3: Implement saved-list index**

Use cursor pagination, newest updated first, pull-to-refresh, empty/error/loading states, name, item count, `预估合计`, and updated date. Do not show transaction status.

- [ ] **Step 4: Implement detail actions**

View immutable snapshots. `继续编辑` loads available items plus the list ID and `updatedAt` into the draft after a confirmation that it will replace the current draft. `复制` calls the copy API and reports skipped unavailable item names. `删除` requires a modal confirmation and removes only the current user’s list.

- [ ] **Step 5: Test server-rule errors**

Cover unavailable dish conflict, idempotent retry, stale price corrected by response, all-copy-items unavailable, cross-session unauthorized relogin, and deletion failure rollback.

- [ ] **Step 6: Verify and commit**

```powershell
pnpm --filter @ordering/miniapp test -- list-save list-detail
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp
git commit -m "feat: add private saved-list workflows"
```

### Task 7: Profile page, privacy controls, and account deletion

**Files:**
- Create: `apps/miniapp/src/pages/profile/index.json`
- Create: `apps/miniapp/src/pages/profile/index.wxml`
- Create: `apps/miniapp/src/pages/profile/index.wxss`
- Create: `apps/miniapp/src/pages/profile/index.ts`
- Create: `apps/miniapp/src/pages/privacy/index.json`
- Create: `apps/miniapp/src/pages/privacy/index.wxml`
- Create: `apps/miniapp/src/pages/privacy/index.wxss`
- Create: `apps/miniapp/src/pages/privacy/index.ts`
- Modify: `apps/miniapp/src/app.json`
- Test: `apps/miniapp/tests/pages/profile.test.ts`

**Interfaces:**
- Consumes: profile, favorites, draft, clear-data, and account APIs.
- Produces: profile editing, privacy explanation, local/server data clearing, and irreversible account deletion.

- [ ] **Step 1: Write destructive-action tests**

Test that “清空个人数据” requires confirmation, calls the server, clears local draft and favorite cache, but retains profile/session. Test that “注销账号” uses a separate stronger confirmation, calls account deletion, removes token/profile/draft caches, and relaunches into a new login.

- [ ] **Step 2: Build profile editing**

Reuse the avatar-picker. Show default profile when skipped, signed avatar URL when present, nickname edit, favorites link, privacy link, clear-data action, and account-deletion action. A failed avatar or nickname update leaves the prior saved profile visible.

- [ ] **Step 3: Write the privacy page content**

Explain that identity matching uses WeChat login, avatar/nickname are optional, menu selections and favorites are private, the administrator sees only aggregates, how to clear data, and how deletion works. Provide a button whose tap handler calls `wx.openPrivacyContract`; operator contact information is maintained in that platform contract during filing and release. When the API is unavailable in a development base library, show a clear message instead of fabricating local policy content.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --filter @ordering/miniapp test -- profile
pnpm --filter @ordering/miniapp typecheck
git add apps/miniapp
git commit -m "feat: add profile and privacy self-service"
```

### Task 8: Mini Program acceptance, performance, and real-device runbook

**Files:**
- Create: `apps/miniapp/tests/acceptance/user-journey.test.ts`
- Create: `docs/runbooks/miniapp-development.md`
- Create: `docs/checklists/miniapp-real-device.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: every Mini Program task and the server acceptance environment.
- Produces: reproducible automated checks plus a signed-off real-device checklist.

- [ ] **Step 1: Add the automated user journey**

Mock only the network boundary. Exercise login, onboarding skip, category load, search, favorite, add dish, quantity/note, local persistence after page reconstruction, save, snapshot detail, copy, edit, clear data, and account deletion. Assert no request body contains `userId`, client-calculated total, AppSecret, or another user identifier.

- [ ] **Step 2: Add the workspace verification command**

```json
{
  "scripts": {
    "verify:miniapp": "pnpm --filter @ordering/miniapp typecheck && pnpm --filter @ordering/miniapp test"
  }
}
```

- [ ] **Step 3: Document Developer Tools setup**

Document importing `apps/miniapp`, placing the real AppID only in ignored private configuration, enabling local development without domain validation only for development, using a LAN/HTTPS test endpoint for real devices, npm build behavior, test-account switching, and clearing local storage.

- [ ] **Step 4: Execute the real-device checklist**

On current iOS and Android WeChat versions verify optional avatar/nickname, skip, relaunch, search input, category scrolling, favorite rapid taps, 99 quantity limit, 100-character note limit, weak network, expired session, image fallback, save retry, separate accounts, clearing, deletion, and that the share menu is absent.

- [ ] **Step 5: Run the full gate and commit**

```powershell
pnpm install --frozen-lockfile
pnpm verify:server
pnpm verify:miniapp
git add package.json apps/miniapp docs/runbooks/miniapp-development.md docs/checklists/miniapp-real-device.md
git commit -m "test: complete mini program acceptance coverage"
```

## Mini Program Plan Completion Gate

Before production deployment:

- `pnpm verify:server` and `pnpm verify:miniapp` pass from a clean install.
- The full journey passes in Developer Tools and on at least one iOS and one Android device.
- First entry prompts for profile but skip grants all functionality.
- Two real WeChat accounts see shared menu data and isolated private data.
- No page, button, response copy, or privacy text implies ordering, payment, fulfilment, table service, pickup, or merchant processing.
- The production API origin remains blocked from release upload until the real domain, ICP filing, HTTPS, and Mini Program domain configuration are complete.
