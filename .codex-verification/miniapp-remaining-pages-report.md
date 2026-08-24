# Mini Program remaining pages verification report

Date: 2026-08-24  
Scope: `pages/current-list`, `pages/my-lists`, `pages/profile`, their models and page wiring, plus the shared draft/favorites behavior required by these pages.

## Final status

Status: **DONE — independent review APPROVED after fix round 3/5**

Final evidence:

- `pnpm --filter @ordering/miniapp test` — exit 0; 21 test files passed; 110 tests passed.
- `pnpm --filter @ordering/miniapp typecheck` — exit 0 (`tsc --noEmit`).
- Fix 3 targeted regression — 2 files / 11 tests passed.
- Fix 2 targeted regression — 7 files / 51 tests passed.
- Static prohibited-copy scan — 0 matches for `购物车|下单|订单|结算|支付|商家|桌台|取餐|配送`.
- Static bare-WXML-role scan — 0 non-`aria-role` matches.
- Registered page completeness scan — 0 missing files across all six `index.ts/json/wxml/wxss` page quartets.
- Independent final review — **APPROVED**, with no Critical, Important, or Minor findings left open.

Per `AGENTS.md`, no Git command was run; verification was file-level and command-based.

## Initial implementation GREEN

The remaining native pages were implemented with behavior-focused models and real Page wiring:

- Current list: persisted local draft editing, integer-cent estimated totals, availability presentation, create/update save flows, conflict recovery, and unavailable-dish handling.
- My lists: cursor pagination, inline immutable list detail, edit/copy/delete actions, unavailable-item notices, and draft replacement.
- Profile: avatar/nickname editing, favorites navigation, privacy-contract fallback, private-data clearing, and account deletion.

Initial GREEN evidence: **17 test files / 83 tests passed**, with typecheck clean.

## Initial independent review — 7 Important + 2 Minor

The first review identified seven Important and two Minor gaps. They covered:

- save-time availability validation, stale draft protection, and duplicate-save ownership;
- stale pagination/detail responses and page lifecycle invalidation;
- copy idempotency reuse and delete-response reconciliation;
- partial profile-save baselines and destructive-operation ordering;
- favorite mutation generation safety and destructive-flow settling;
- production Page wiring for the new helpers rather than model-only coverage;
- pager upsert visibility for opened/copied details and a stable detail-item WXML key.

RED coverage was added before production changes. The initial review suite exposed 24 expected failures while retaining 18 passing behaviors.

## Fix round 1/5 — first review findings

Implemented:

- Current-list save controller now rechecks availability immediately before create/update, applies current availability to the page, blocks unavailable items, returns stale when the preflight draft changes, coalesces pending taps, preserves failures, and keeps 409 conflicts recoverable.
- Saved-list pager rejects obsolete success/failure responses after refresh; detail requests use invalidatable generations; copy retries reuse one idempotency key until success; delete failures reconcile against a remote GET.
- Detail/copy results upsert into the pager, immutable detail rows carry stable `position`, and WXML keys by that position.
- Profile saves retain the real successful server baseline after partial completion and keep only unfinished fields retryable.
- Destructive profile actions settle existing favorite writes before the remote mutation; favorite clear advances mutation generation so old callbacks cannot repopulate state or cache.
- All new helpers were connected to real Page lifecycle and action paths.

GREEN evidence after Fix 1: **18 test files / 100 tests passed**; typecheck clean.

## Review re-check — 3 Important

The next independent review found three remaining Important races:

1. A create/update response could clear a newer draft and a hidden page could still steal navigation.
2. An older refresh/load-more response could overwrite a local pager upsert or revive a locally removed list.
3. Settling only the current favorite-work snapshot did not stop new favorite writes from starting during remote destructive work.

The accompanying DELETE-404 efficiency follow-up was also included: a direct DELETE 404 already proves absence and should not require another GET.

## Fix round 2/5 — response ownership, pager replay, and global barrier

Implemented:

- Current-list compares `mutationKey` again after create/update returns. A changed draft produces `saved-stale`, retains the newer draft, and never clears it. Page visibility is tracked through `onShow/onHide`; hidden save responses do not toast, request a detail, or switch tabs.
- Pager requests capture a local-mutation revision. Server reset/append candidates replay later per-ID upsert/remove operations before commit, preserving local intent, sort order, cursor, and stale-request behavior.
- Direct DELETE 404 removes the local list and returns reconciled success without a GET; other failures keep the original GET reconciliation path.
- Favorites gained a token-based, idempotently released global mutation barrier. While blocked, new intents make no API request and cause no optimistic local update. Release resumes queued intent when no destructive clear occurred.
- Profile destructive flows execute `confirm → block → settle → remote → local → release`, release in `finally` on remote failure, and never block when confirmation is canceled. The real profile Page injects both the barrier and settle functions.

GREEN evidence after Fix 2: **20 test files / 108 tests passed**; typecheck clean.

## Fix round 3/5 — queued intent cancellation after successful clear

The global barrier exposed one final integration gap: a favorite intent queued during private-data clearing survived `clearFavorites()`. The successful destructive flow then released the barrier and replayed that intent after the server had already cleared favorites, causing a new remote write and cache refill.

RED evidence:

- Direct favorites state scenario: `block → setFavorite → clearFavorites → release`.
- Real profile destructive integration: an intent queued after the barrier was established but before successful remote/local clearing.
- Result: 2 files failed; 2 tests failed and 9 passed. Both failures showed the queued Promise resolving instead of being explicitly canceled.

Implemented:

- Added `FavoriteMutationCanceledError` with name `FavoriteMutationCanceledError` and message `收藏操作已取消`.
- `clearFavorites()` atomically takes and clears `blockedIntents`, clears favorite state/cache, and rejects all queued waiters with the cancellation error.
- Barrier tokens remain intact. Nested or repeated releases stay safe and idempotent, but there is no cleared intent left to flush.
- Remote destructive failure does not call `clearFavorites()`, so its `finally` release still resumes queued user intent as designed.

GREEN evidence:

- Fix 3 targeted: 2 files / 11 tests passed.
- Fix 2 regression: 7 files / 51 tests passed.
- Full Mini Program suite: **21 files / 110 tests passed**.
- Typecheck: exit 0.

## Principal files covered

Production:

- `apps/miniapp/src/pages/current-list/model.ts`, `index.ts`, `index.json`, `index.wxml`, `index.wxss`
- `apps/miniapp/src/pages/my-lists/model.ts`, `index.ts`, `index.json`, `index.wxml`, `index.wxss`
- `apps/miniapp/src/pages/profile/model.ts`, `index.ts`, `index.json`, `index.wxml`, `index.wxss`
- `apps/miniapp/src/state/draft.ts`, `state/favorites.ts`, `state/navigation.ts`
- `apps/miniapp/src/api/lists.ts`, `api/profile.ts`, `api/menu.ts`

Regression coverage:

- `apps/miniapp/tests/pages/current-list.test.ts`
- `apps/miniapp/tests/pages/current-list-page.test.ts`
- `apps/miniapp/tests/pages/my-lists.test.ts`
- `apps/miniapp/tests/pages/profile.test.ts`
- `apps/miniapp/tests/pages/profile-barrier-wiring.test.ts`
- `apps/miniapp/tests/pages/profile-destructive-barrier.integration.test.ts`
- `apps/miniapp/tests/pages/remaining-wiring.test.ts`
- `apps/miniapp/tests/state/favorites.test.ts`

## Completion

All remaining-page implementation, regression, type, static, and independent-review gates are complete. Completion state: **complete — review clean after fix round 3/5**.
