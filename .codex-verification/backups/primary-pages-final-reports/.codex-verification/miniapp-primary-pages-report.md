# Mini Program primary pages implementation report

Date: 2026-08-21  
Scope: `pages/onboarding/index`, `pages/select/index`, `pages/dish-detail/index`, `components/avatar-picker`, `components/dish-card`, `components/status-view`, and the global `app.wxss` replacement.

## TDD evidence

### RED

The primary agent ran the new behavior suites before implementation. The command exited with code 1: the onboarding, select, and dish-detail suites each failed because their corresponding `model.ts` module did not exist. The existing session-onboarding test selected by the command passed. This was the expected feature-missing failure.

### GREEN-ready verification

Command run by this implementation agent:

```text
pnpm --filter @ordering/miniapp test -- onboarding select dish-detail
```

Result: exit 0; 4 test files passed; 17 tests passed.

The first `pnpm --filter @ordering/miniapp typecheck` exposed eight errors in `components/dish-card/index.ts`. Root cause: the WeChat type declaration does not allow `null` as the default value of an `Object` property, which invalidated property and method inference. The sandbox helper then prevented `apply_patch` from updating the new file. Complete corrected replacements were generated at:

- `.codex-verification/replacements/apps/miniapp/src/components/dish-card/index.ts`
- `.codex-verification/replacements/apps/miniapp/src/components/dish-card/index.wxml`

The primary agent must copy those two replacements before the final typecheck. The WXML replacement also changes the non-native `article` tag to `view`.

## Files implemented

- Onboarding: `apps/miniapp/src/pages/onboarding/model.ts` and the `index.ts/json/wxml/wxss` page quartet.
- Select: `apps/miniapp/src/pages/select/model.ts` and the `index.ts/json/wxml/wxss` page quartet.
- Dish detail: `apps/miniapp/src/pages/dish-detail/model.ts` and the `index.ts/json/wxml/wxss` page quartet.
- Components: four files each under `avatar-picker`, `dish-card`, and `status-view`.
- Tests: `apps/miniapp/tests/pages/onboarding.test.ts`, `select.test.ts`, and `dish-detail.test.ts`.
- Styling: full replacement at `.codex-verification/replacements/apps/miniapp/src/app.wxss`.

## Behavior and constraint self-check

- Onboarding uses `chooseAvatar` and `input type="nickname" maxlength="40"`; no `wx.getUserProfile` is used. Save is gated by avatar plus trimmed nickname and executes avatar, nickname, completion in order. Skip only completes onboarding. Errors keep the page draft and expose retry.
- Select loads categories, the first 20 dishes, and favorites concurrently after `app.globalData.ready`. Search is trimmed, debounced by 300 ms, and protected by a monotonically increasing request guard. Pagination deduplicates cursor pages; pull-to-refresh reloads categories, favorites, and dishes. Category, query, and all/favorites mode are retained in module state for the app session.
- Favorite mode resolves all currently available favorite IDs in batches through the availability API, then applies category/search locally, preventing a first-page-only favorite view.
- Dish cards own no API or draft state and emit only dish IDs. The avatar picker emits only the temporary avatar path and nickname. The status view emits only its action event.
- Dish detail calls availability with the encoded route ID, distinguishes unavailable and malformed/error responses, formats integer cents, supports favorite changes, and adds only available dishes to the current list.
- Loading skeletons, empty menu, empty search, empty favorites, recoverable errors, image fallback, unavailable detail, and loading-more feedback are present.
- Touch controls have at least `88rpx` minimum height. The visual language uses paper neutrals, ink green, cinnabar, serif fallbacks, restrained seals, and no purple gradient.
- A source scan of the implemented pages/components found none of the prohibited transactional terms.
- `app.json`, server code, and contracts were not changed. No Git command was run.

## Status

Implementation is ready for the primary agent's GREEN gate after applying the three full replacements: global `app.wxss`, corrected `dish-card/index.ts`, and corrected `dish-card/index.wxml`.
