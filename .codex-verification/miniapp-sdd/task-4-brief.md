# Task 4: Private favorites

## Goal

Add server-backed private favorites with optimistic state, rollback, serialized rapid toggles, a favorites page, and menu integration.

## Files

- Create `apps/miniapp/src/api/favorites.ts`
- Create `apps/miniapp/src/state/favorites.ts`
- Create `apps/miniapp/src/pages/favorites/index.{json,wxml,wxss,ts}`
- Modify `apps/miniapp/src/pages/menu/index.ts` and its WXML/config only as required for favorite integration.
- Test `apps/miniapp/tests/state/favorites.test.ts` and focused page integration when needed.

## Actual server interfaces

- `GET /api/v1/favorites?cursor=&limit=20` returns `{ items: PublicDishDto[]; nextCursor: string | null }`, newest first. Unpublished/deleted dishes are silently omitted.
- `PUT /api/v1/favorites/:dishId` returns `{ dishId, favorited: true }` and is idempotent.
- `DELETE /api/v1/favorites/:dishId` returns `{ dishId, favorited: false }` and is idempotent.
- Use Task 1 request client; URL-encode dish IDs.

## State interface and behavior

Produce:

```ts
export type FavoriteState = {
  ids: Set<string>;
  loaded: boolean;
  pending: Set<string>;
};

export async function loadFavorites(): Promise<void>;
export function isFavorite(dishId: string): boolean;
export async function setFavorite(dishId: string, desired: boolean): Promise<void>;
```

Also expose a subscription/snapshot interface suitable for native pages without leaking mutable Sets.

- Apply the requested state immediately for optimistic UI.
- Roll back to the last confirmed state after terminal API failure.
- Serialize changes per dish. When two rapid taps request opposite states, finish with the latest desired state without overlapping requests or leaving a stale result.
- A pending request disables only that dish's favorite control, not the whole page.
- Loading favorites replaces confirmed IDs from the server; pagination may be completed internally so `ids` represents all loaded favorites, or the state API may explicitly support pages as long as page behavior remains correct.
- Provide a cache reset API for Task 7 privacy actions.

## Favorites page

- Register as a non-tab page reachable from Profile later; it may also be linked from menu if useful without adding a fifth tab.
- List active favorite dishes using the existing dish card.
- Allow removing a favorite and adding a dish to the local draft only if the draft interface already exists; because Task 5 is later, keep the add event/handler integration point compile-safe and complete it in Task 5.
- Show clear loading, empty, error/retry, pull-to-refresh, and cursor pagination states.
- Treat server-omitted unpublished favorites as normal absence, not an error.
- Match the shared warm food-journal visual system and selection-only language.

## Menu integration

- Load favorites after session readiness and map state by dish ID.
- Handle dish-card `favoritechange` events through the state module.
- Reflect optimistic and pending state per card; show a concise recoverable error and rollback on failure.
- Do not move request logic into the component or page.

## Tests and TDD

Write tests first and record RED/GREEN evidence. Cover:

- immediate local optimistic toggle;
- successful server confirmation;
- rollback after failure;
- two rapid opposite taps serialize and final desired state wins;
- pending state affects only the target dish;
- idempotent PUT/DELETE mapping;
- unavailable dishes omitted by load are not surfaced as errors;
- menu/page reflects optimistic and rollback states.

Run focused favorites tests, then complete miniapp tests and typecheck.

## Global constraints

- Favorites are private and server-backed; never store them as authoritative local storage.
- Native Mini Program only; pages never call `wx.request` directly.
- Use selection/list wording; never imply ordering, checkout, payment, fulfilment, merchant, table, pickup, or delivery.
- No share, collaboration, public profile, user-created dish, or admin entry.
- Do not execute Git commands and do not commit.

