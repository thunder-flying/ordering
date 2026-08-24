# Miniapp pages core verification report

Status: DONE_WITH_CONCERNS (pending replacement deployment and final verification by the primary agent).

## Added files

- `apps/miniapp/src/api/profile.ts`
- `apps/miniapp/src/api/menu.ts`
- `apps/miniapp/src/api/favorites.ts`
- `apps/miniapp/src/api/lists.ts`
- `apps/miniapp/src/utils/price.ts`
- `apps/miniapp/src/state/profile.ts`
- `apps/miniapp/src/state/favorites.ts`
- `apps/miniapp/src/state/draft.ts`
- Core behavior tests in `apps/miniapp/tests/api`, `apps/miniapp/tests/state`, and `apps/miniapp/tests/utils`.
- `.codex-verification/miniapp-pages-progress.md`

## Replacement files awaiting deployment

The Windows sandbox helper rejected every `apply_patch` update of an existing file. Complete corrected replacements are staged under `.codex-verification/replacements/` for the primary agent to atomically deploy after backing up original files:

- `apps/miniapp/src/api/auth.ts`, `request.ts`, `menu.ts`, `favorites.ts`, `lists.ts`
- `apps/miniapp/src/utils/idempotency.ts`
- `apps/miniapp/src/state/session.ts`, `draft.ts`, `profile.ts`
- `apps/miniapp/tests/api/auth.test.ts`, `clients.test.ts`
- `apps/miniapp/tests/state/favorites.test.ts`, `draft.test.ts`, `session-onboarding.test.ts`

## RED tests

Command run by the primary agent:

`pnpm --filter @ordering/miniapp test -- auth clients price idempotency draft favorites session-onboarding`

Result: exit 1 as expected. Seven suites failed: missing profile/menu/favorites/lists, draft, favorites state, and price modules; missing `markOnboardingCompleted`; and legacy `idem-*` values not matching UUID v4. The original auth fixture initially failed for an incorrect bare response shape and is corrected in the staged replacement.

## GREEN verification

Pending staged replacement deployment. The primary agent must run:

`pnpm --filter @ordering/miniapp test`

`pnpm --filter @ordering/miniapp typecheck`

## Self-check

- All client endpoints use `/api/v1`; query and dynamic path values use `encodeURIComponent`.
- List client payload builders strip reference prices and user IDs.
- Draft storage is versioned, contains no session credential, validates bounds, clears corrupt values, and totals cents as integers.
- Favorites keep a cache, optimistic state, rollback behavior, per-dish serialization, and cache clearing.
- Session update only persists the onboarding flag and does not return a token.

## Remaining concerns

- Deployment and full GREEN verification are pending because of the tooling failure described above.
- No Git operation was run.
