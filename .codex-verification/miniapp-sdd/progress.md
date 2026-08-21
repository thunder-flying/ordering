# SDD ledger — plan: docs/superpowers/plans/2026-08-19-personal-menu-miniapp.md

## Execution rules

- Ruling: Do not create a worktree, inspect Git state, generate Git diffs, stage, commit, or run any Git command — root `AGENTS.md` forbids Git unless the current request explicitly authorizes it — cost if wrong: reviews use task file scopes and direct read-only inspection instead of commit-range diffs.
- Ruling: Detect terminal authentication from HTTP status 401, not an `UNAUTHENTICATED` string in the response body — the implemented server contract returns numeric HTTP status in `ApiResponse.code` and a safe Chinese message — cost if wrong: a future server contract that adds symbolic error codes may warrant a client update.
- Ruling: Keep `pnpm-workspace.yaml` unchanged unless package discovery proves otherwise — its existing `apps/*` glob already includes `apps/miniapp` — cost if wrong: package commands will reveal a discovery failure during Task 1 verification.

## Preflight consistency scan

| Tasks | Producer / consumer or internal check | Finding |
|---|---|---|
| 1 | Package, native shell, request/session APIs, tests | Internally consistent after the HTTP-401 ruling above; `project.private.config.json` is already ignored globally. |
| 2 | Profile API/state, onboarding page/component, tests | Consistent with server `AuthSessionDto`, `ProfileDto`, avatar upload, and onboarding-complete routes. |
| 3 | Menu API, price utility, dish/status components, browser page | Consistent; public dish image is required by the current DTO, while UI still needs a local error fallback. |
| 4 | Favorites API/state/page and menu integration | Consistent; serial desired-state behavior is load-bearing for rapid taps. |
| 5 | Versioned local draft, validation, quantity component, current-list page | Consistent; draft retains display snapshots locally but sends only IDs, quantities, and notes. |
| 6 | Saved-list API/index/detail/save workflows | Consistent with server DTOs; delete uses no optimistic timestamp because the existing server endpoint does not accept one. |
| 7 | Profile/privacy/clear-data/delete-account flows | Consistent; app page registration expands here and destructive actions require separate confirmations. |
| 8 | Acceptance test, runbook, checklist, workspace command | Consistent; automated checks cannot replace the explicitly manual iOS/Android sign-off. |
| 1 → 2 | Session and upload APIs consumed by onboarding | Interface matches plan. |
| 1 → 3 | Authenticated request client consumed by menu API | Public reads may use the same client after launch readiness. |
| 1 → 4 | Session/request APIs consumed by favorites | Interface matches plan. |
| 1 → 6 | Idempotent request support consumed by list save/copy/edit | Interface matches plan. |
| 1 → 7 | Session clearing consumed by account deletion | Interface matches plan. |
| 2 → 7 | Profile API/state and avatar picker reused by profile page | Interface matches plan. |
| 3 → 4 | Dish card favorite events and menu page integration | Task 4 extends Task 3 without moving API ownership into the component. |
| 3 → 5 | Menu dish DTOs and menu-page add event consumed by draft | Task 5 owns draft persistence and totals. |
| 4 → 7 | Favorite cache cleared after private-data/account deletion | Interface matches plan. |
| 5 → 6 | Draft and mutation key consumed by save/edit flows | Interface matches plan. |
| 5 → 7 | Local draft cleared by privacy actions | Interface matches plan. |
| 6 → 7 | Server-backed saved lists cleared by private-data/account deletion | Server owns the destructive transaction. |
| 1–7 → 8 | All modules/pages consumed by automated journey and documentation | Acceptance task is intentionally last. |

## Task status

- Task 1: pending
- Task 2: pending
- Task 3: pending
- Task 4: pending
- Task 5: pending
- Task 6: pending
- Task 7: pending
- Task 8: pending

