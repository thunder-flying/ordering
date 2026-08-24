# SDD ledger — plan: docs/superpowers/plans/2026-08-19-personal-menu-miniapp.md

## Rulings

1. Current `app.json`'s six routes are authoritative. The old plan's `menu`/`lists`/`list-detail`/`favorites`/`privacy` routes are folded into `select`/`my-lists`/`dish-detail`/`profile`; the cost is that some features use page-local modes instead of dedicated routes.
2. Per `AGENTS.md`, all Git, worktree, and commit steps are skipped. The cost is that review uses file-level checks rather than a Git diff.

## Batch interface scan

| Batch | Produces | Consumes |
| --- | --- | --- |
| Core/API | request-bound API clients; session/profile/favorites/draft state; cents utilities | contracts, storage/request/upload utilities |
| Onboarding | profile completion writes and session status update | profile API, session state |
| Select | dish querying and favorite intent controls | menu/favorites APIs, favorites state |
| Draft | menu-list draft editing and totals | draft state, price utilities |
| Saved lists | persisted list CRUD and payload builders | lists API, draft state |
| Profile | profile editing and session-derived identity | profile API, profile/session state |

Core batch: complete (9 files / 29 tests, typecheck clean; review clean after fix round 2/5)

Core batch: fix round 1/5 (2 addressed, 0 open — enforced /api/v1 boundary; loaded all favorite cursor pages)

Core batch: fix round 2/5 (1 addressed, 0 open — rejected normalized dot-segment API path bypasses)

Primary pages batch: implementation complete (3 models, 3 native pages, 3 reusable components; fix-round 6 files / 32 tests and full 13 files / 54 tests passing; typecheck clean; first three page quartets complete; prohibited transactional copy and bare role scans clean); completion: review re-check pending

Primary pages: fix round 1/5 (6 Important addressed, 0 open — startup route, replay-safe availability, detail/select/favorite races, refresh errors)
