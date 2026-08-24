# Miniapp pages core verification report

Status: DONE

## Scope completed

- Corrected WeChat silent-login endpoint to `/api/v1/auth/wechat`.
- Replaced legacy idempotency values with UUID v4 values (correct version and variant bits).
- Added integer-cent price formatting, multiplication, and summation utilities.
- Added typed `/api/v1` clients for profile, public menu, favorites, and saved lists.
- Added versioned profile, favorites, and local-draft state, including protected session onboarding updates.
- Added behavior-focused Vitest coverage for API paths/payload shaping, cents calculations, UUIDs, draft persistence/limits, favorites optimistic serialization, login endpoint, and session flag updates.

## Added and modified files

- `apps/miniapp/src/api/auth.ts`
- `apps/miniapp/src/api/request.ts`
- `apps/miniapp/src/api/profile.ts`
- `apps/miniapp/src/api/menu.ts`
- `apps/miniapp/src/api/favorites.ts`
- `apps/miniapp/src/api/lists.ts`
- `apps/miniapp/src/utils/idempotency.ts`
- `apps/miniapp/src/utils/price.ts`
- `apps/miniapp/src/state/session.ts`
- `apps/miniapp/src/state/profile.ts`
- `apps/miniapp/src/state/favorites.ts`
- `apps/miniapp/src/state/draft.ts`
- `apps/miniapp/tests/api/auth.test.ts`
- `apps/miniapp/tests/api/clients.test.ts`
- `apps/miniapp/tests/api/request.test.ts`
- `apps/miniapp/tests/utils/idempotency.test.ts`
- `apps/miniapp/tests/utils/price.test.ts`
- `apps/miniapp/tests/state/draft.test.ts`
- `apps/miniapp/tests/state/favorites.test.ts`
- `apps/miniapp/tests/state/session.test.ts`
- `apps/miniapp/tests/state/session-onboarding.test.ts`
- `.codex-verification/miniapp-pages-progress.md`

## RED evidence

Command run by the primary agent:

`pnpm --filter @ordering/miniapp test -- auth clients price idempotency draft favorites session-onboarding`

Result: exit 1 as expected. The initial RED run reported seven failing suites: missing profile/menu/favorites/lists clients, missing draft and favorites state, missing price utilities, missing `markOnboardingCompleted`, and legacy `idem-*` values failing the UUID v4 assertion. The first auth fixture exposed an incorrect test wrapper rather than endpoint behavior; it was corrected to supply the real `wx.request` response shape before GREEN verification.

## GREEN verification

Commands run by the primary agent:

`pnpm --filter @ordering/miniapp test`

Result: exit 0 — 9 test files passed, 28 tests passed.

`pnpm --filter @ordering/miniapp typecheck`

Result: exit 0 — typecheck clean.

## Contract and safety self-check

- All client calls target real `/api/v1` server routes, and query/dynamic path values are encoded with `encodeURIComponent`.
- List create/update builders include only name, idempotency key, dish ID, quantity, note, and (for updates) expected timestamp. They strip client reference price and `userId` fields.
- Request validation failures are surfaced as rejected promises; response data is checked before resolution; authentication replay rules remain unchanged.
- Draft storage uses `ordering:draft:v1`, version `1`, no credential data, safe corrupt-data removal, quantity 1–99, trimmed 100-character notes, trimmed 40-character names, user-change mutation keys, and integer totals.
- Favorites hydrate a cache, optimistically update, roll back failures, serialize per-dish rapid changes so the last intent wins, and clear their cache on demand.
- Session onboarding update persists only the stored boolean flag and does not expose a token API.

## Remaining items

- No implementation blocker remains for this core batch.
- Git was not invoked, as required by `AGENTS.md`; review was performed at file level.
