# Miniapp pages core verification report

Status: DONE

## Scope completed

- Corrected WeChat silent-login endpoint to `/api/v1/auth/wechat`.
- Replaced legacy idempotency values with UUID v4 values (correct version and variant bits).
- Added integer-cent price formatting, multiplication, and summation utilities.
- Added typed `/api/v1` clients for profile, public menu, favorites, and saved lists.
- Added versioned profile, favorites, and local-draft state, including protected session onboarding updates.
- Added behavior-focused Vitest coverage for API paths/payload shaping, cents calculations, UUIDs, draft persistence/limits, favorites optimistic serialization and pagination, login endpoint, and session flag updates.

## Initial RED/GREEN

`pnpm --filter @ordering/miniapp test -- auth clients price idempotency draft favorites session-onboarding` initially exited 1 as expected: missing API/state/price modules, missing onboarding session update, and non-UUID idempotency values failed.

After implementation, `pnpm --filter @ordering/miniapp test` passed 9 files / 28 tests and `pnpm --filter @ordering/miniapp typecheck` exited 0.

## Fix round 1/5 — API boundary and favorites pagination

RED: `pnpm --filter @ordering/miniapp test -- request favorites` exited 1. The old boundary allowed the legacy `/api` prefix, and favorites retained only the first cursor page.

Changes: `src/config.ts` now enforces relative `/api/v1` routes; `src/state/favorites.ts` follows cursor pages with a repeat-cursor guard; request and favorites tests exercise these real behaviors.

GREEN: targeted request/favorites tests passed 2 files / 10 tests; full tests passed 9 files / 29 tests; typecheck exited 0.

## Fix round 2/5 — normalized path bypasses

RED command run by the primary agent:

`pnpm --filter @ordering/miniapp test -- request`

Result: exit 1, 1 request-boundary test failed as expected. Paths such as `/api/v1/../legacy` and encoded dot segments passed the prefix check and entered the mocked network boundary, rather than rejecting at URL validation.

Changes:

- `apps/miniapp/src/config.ts` now separates the pathname from query data; rejects fragments and backslashes; safely decodes each pathname segment (including nested encodings); and rejects dot segments, decoded separators, and malformed encodings.
- `apps/miniapp/tests/api/request.test.ts` adds plain/encoded (case-insensitive) dot-segment and backslash bypass assertions, checks that rejection occurs before a network call, and retains a legal `/api/v1/...?...` path assertion.

GREEN evidence run by the primary agent:

`pnpm --filter @ordering/miniapp test -- request` — exit 0, 1 file / 6 tests passed.

`pnpm --filter @ordering/miniapp test` — exit 0, 9 files / 29 tests passed.

`pnpm --filter @ordering/miniapp typecheck` — exit 0.

## Modified files

- `apps/miniapp/src/config.ts`, `api/auth.ts`, `api/request.ts`, `api/profile.ts`, `api/menu.ts`, `api/favorites.ts`, `api/lists.ts`
- `apps/miniapp/src/utils/idempotency.ts`, `utils/price.ts`
- `apps/miniapp/src/state/session.ts`, `state/profile.ts`, `state/favorites.ts`, `state/draft.ts`
- `apps/miniapp/tests/api/auth.test.ts`, `api/clients.test.ts`, `api/request.test.ts`
- `apps/miniapp/tests/utils/idempotency.test.ts`, `utils/price.test.ts`
- `apps/miniapp/tests/state/draft.test.ts`, `state/favorites.test.ts`, `state/session.test.ts`, `state/session-onboarding.test.ts`
- `.codex-verification/miniapp-pages-progress.md`

## Self-check and remaining items

- All client paths are constrained to relative `/api/v1` endpoints, including after path normalization checks; query and dynamic values are encoded.
- List writes strip client price and user IDs. Drafts contain no credentials and use integer totals. Favorites page through all cursors and preserve optimistic final intent.
- Git was not invoked, as required by `AGENTS.md`; review is file-level only.
- No implementation blocker remains; review re-check is pending.
