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

Primary pages batch: complete (3 models, 3 native pages, 3 reusable components; select 1 file / 14 tests and full 13 files / 59 tests passing; typecheck clean; first three page quartets complete; prohibited transactional copy and bare role scans clean; review clean after fix round 3/5)

Primary pages: fix round 1/5 (6 Important addressed, 0 open — startup route, replay-safe availability, detail/select/favorite races, refresh errors)

Primary pages: fix round 2/5 (3 addressed, 0 open — separated bootstrap/query ownership, stale refresh cancellation, full bootstrap retry)

Primary pages: fix round 3/5 (1 Important addressed, 0 open — failed refresh sources retain and replay the complete refresh action)

Remaining pages: initial implementation GREEN (current-list, my-lists, profile; 17 files / 83 tests; typecheck clean)

Remaining pages: initial review (7 Important + 2 Minor; RED coverage added before production fixes)

Remaining pages: fix round 1/5 (9 addressed — save-time availability and stale ownership; pager/detail/copy/delete races; partial profile baseline; favorite mutation generation and settle; real Page wiring; stable detail position; 18 files / 100 tests; typecheck clean)

Remaining pages: review re-check (3 Important — post-write draft/navigation ownership; pager local-mutation replay; destructive favorite-write barrier; direct DELETE-404 follow-up included)

Remaining pages: fix round 2/5 (post-response `saved-stale` and page visibility; revisioned pager replay; direct DELETE-404 reconciliation; global favorite barrier; profile confirm→block→settle→remote→local→release; 20 files / 108 tests; typecheck clean)

Remaining pages: fix round 3/5 (queued favorite intents are canceled by successful clear and cannot replay after barrier release; Fix 3 targeted 2 files / 11 tests; Fix 2 regression 7 files / 51 tests)

Remaining pages: complete — review clean after fix round 3/5 (final 21 files / 110 tests; typecheck clean; prohibited transactional copy 0 matches; bare WXML role 0 matches; six page quartets complete; independent review APPROVED; no open findings)
