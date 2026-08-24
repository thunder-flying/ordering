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

Core batch: complete (9 files / 28 tests, typecheck clean; file-level review pending)
