# Mini Program primary pages implementation report

Date: 2026-08-21  
Scope: `pages/onboarding/index`, `pages/select/index`, `pages/dish-detail/index`, `components/avatar-picker`, `components/dish-card`, `components/status-view`, and global Mini Program styling.

## Initial TDD evidence

### RED

The primary agent ran the new behavior suites before implementation. The command exited with code 1: the onboarding, select, and dish-detail suites each failed because their corresponding `model.ts` module did not exist. The existing session-onboarding test selected by the command passed. This was the expected feature-missing failure.

### GREEN

The implementation agent first ran:

```text
pnpm --filter @ordering/miniapp test -- onboarding select dish-detail
```

Result: exit 0; 4 test files passed; 17 tests passed.

The initial typecheck exposed eight errors in `components/dish-card/index.ts`. Root cause: the WeChat type declaration does not allow `null` as the default value of an `Object` property, which invalidated property and method inference. Corrected replacements used a typed object default and direct property access; the WXML correction also replaced the non-native `article` tag with `view`.

After applying the replacements, the primary agent reported:

- Targeted onboarding/select/dish-detail tests: 4 files, 17 tests passed.
- Full Mini Program tests: 12 files, 45 tests passed.
- TypeScript typecheck: exit 0.
- First three registered page quartets: complete.
- Prohibited transactional copy scan: clean.

## Fix round 1/5

### Review findings addressed

1. `pages/select/index` is now the first route, so completed users cold-start on the usable tab while `app.ts` still redirects incomplete sessions to onboarding.
2. Request options now support explicit `replaySafe`; only the read-only availability POST uses it and receives a single 401 replay.
3. Dish detail uses a page-owned, monotonically increasing loader. Only the latest request may update loading, ready, unavailable, error, dish, or image state, and `onUnload` invalidates pending work.
4. Select uses a real load coordinator for initial, reset, pagination, refresh, and favorite loads. Mode switches clear `loadingMore` and invalidate stale pagination writes.
5. Pull-to-refresh now stops in every outcome, short-circuits dish refresh when favorite/category refresh fails, preserves existing dishes with a recoverable notice, and uses a blocking error only when no dishes exist.
6. Favorites use a load generation and per-dish mutation revisions, so a stale full GET cannot overwrite the final intent of a concurrent successful mutation.

Minor review items were also addressed: malformed detail responses show safe Chinese copy, native WXML accessibility uses `aria-role`, all/favorites expose readable checked state, dish-card has clickable semantics without a reverse page-model dependency, and small muted text uses darker accessible colors.

### RED evidence

After the six behavior test files were deployed, the fix-round command exited with code 1:

- Test files: 1 passed, 5 failed out of 6.
- Tests: 21 passed, 11 failed out of 32.
- Failures accurately exposed missing replay-safe behavior and client marking, missing detail loader, missing select coordinator/refresh helpers, missing malformed-response copy, and stale favorite GET overwriting a successful PUT.
- The startup behavior test already passed because the existing `app.ts` redirect condition was correct; the route ordering still required the `app.json` configuration change.

### GREEN evidence

After implementation and the strongly typed category fixture correction:

- Fix-round suites: 6 files, 32 tests passed.
- Full Mini Program suite: 13 files, 54 tests passed.
- Select fixture recheck: 1 file, 9 tests passed.
- TypeScript typecheck: exit 0.
- First route: `pages/select/index`.
- First three page quartets: complete.
- Prohibited transactional copy scan: 0 matches.
- Bare `role=` WXML scan: 0 matches.

### Replacement files

Fix round 1 changed 19 production files:

1. `apps/miniapp/src/app.json`
2. `apps/miniapp/src/api/request.ts`
3. `apps/miniapp/src/api/menu.ts`
4. `apps/miniapp/src/state/favorites.ts`
5. `apps/miniapp/src/pages/select/model.ts`
6. `apps/miniapp/src/pages/select/index.ts`
7. `apps/miniapp/src/pages/select/index.wxml`
8. `apps/miniapp/src/pages/select/index.wxss`
9. `apps/miniapp/src/pages/dish-detail/model.ts`
10. `apps/miniapp/src/pages/dish-detail/index.ts`
11. `apps/miniapp/src/pages/dish-detail/index.wxml`
12. `apps/miniapp/src/pages/dish-detail/index.wxss`
13. `apps/miniapp/src/components/dish-card/index.ts`
14. `apps/miniapp/src/components/dish-card/index.wxml`
15. `apps/miniapp/src/components/dish-card/index.wxss`
16. `apps/miniapp/src/components/status-view/index.wxml`
17. `apps/miniapp/src/components/status-view/index.wxss`
18. `apps/miniapp/src/pages/onboarding/index.wxml`
19. `apps/miniapp/src/pages/onboarding/index.wxss`

The final type-only test correction replaced `apps/miniapp/tests/pages/select.test.ts` to add the required literal `sortOrder: 0` to the category fixture without weakening `PublicCategoryDto`.

## Files initially implemented

- Onboarding: `apps/miniapp/src/pages/onboarding/model.ts` and the `index.ts/json/wxml/wxss` page quartet.
- Select: `apps/miniapp/src/pages/select/model.ts` and the `index.ts/json/wxml/wxss` page quartet.
- Dish detail: `apps/miniapp/src/pages/dish-detail/model.ts` and the `index.ts/json/wxml/wxss` page quartet.
- Components: four files each under `avatar-picker`, `dish-card`, and `status-view`.
- Tests: onboarding, select, dish-detail, request, API-client, favorites, and app-startup behavior coverage.
- Styling: global `app.wxss` plus scoped page/component styles.

## Behavior and constraint self-check

- Onboarding uses `chooseAvatar` and `input type="nickname" maxlength="40"`; no `wx.getUserProfile` is used. Save is gated by avatar plus trimmed nickname and executes avatar, nickname, completion in order. Skip only completes onboarding. Errors keep the page draft and expose retry.
- Select loads categories, the first 20 dishes, and favorites concurrently after `app.globalData.ready`. Search is trimmed, debounced by 300 ms, and protected by monotonic request coordination. Pagination deduplicates cursor pages; pull-to-refresh reloads categories, favorites, and dishes. Category, query, and all/favorites mode are retained in module state for the app session.
- Favorite mode resolves all currently available favorite IDs in batches through the availability API, then applies category/search locally.
- Dish cards own no API or draft state and emit only dish IDs. The avatar picker emits only the temporary avatar path and nickname. The status view emits only its action event.
- Dish detail calls availability with the route ID, distinguishes unavailable and malformed/error responses, formats integer cents, supports favorite changes, and adds only available dishes to the current list.
- Loading skeletons, empty menu, empty search, empty favorites, recoverable errors, image fallback, unavailable detail, and loading-more feedback are present.
- Touch controls have at least `88rpx` minimum height. The visual language uses paper neutrals, ink green, cinnabar, serif fallbacks, and restrained seals.
- `app.json` changed only to make select the startup route and darken the inactive tab label. Server code and contracts were not changed. No Git command was run.

## Status

Implementation and automated GREEN gates are complete. Completion state: **review re-check pending**.
