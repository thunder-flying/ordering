# Task 3: Public menu, categories, search, and dish cards

## Goal

Implement the public menu experience: typed category/dish API clients, exact integer-cent formatting, reusable dish/status components, and a category/search/paginated menu page with robust states.

## Files

- Create `apps/miniapp/src/api/menu.ts`
- Create `apps/miniapp/src/utils/price.ts`
- Create `apps/miniapp/src/components/dish-card/index.{json,wxml,wxss,ts}`
- Create `apps/miniapp/src/components/status-view/index.{json,wxml,wxss,ts}`
- Create `apps/miniapp/src/pages/menu/index.{json,wxml,wxss,ts}`
- Test `apps/miniapp/tests/utils/price.test.ts`
- Test `apps/miniapp/tests/components/dish-card.test.ts`
- Add focused page/controller tests when needed to prove debounce, stale-response suppression, pagination, and states.

## Actual server interfaces

- `GET /api/v1/categories` returns `{ items: PublicCategoryDto[] }`.
- `GET /api/v1/dishes?q=&categoryId=&cursor=&limit=20` returns `{ items: PublicDishDto[]; nextCursor: string | null }`.
- Dish `imageUrl` may be a relative `/media/dishes/...` path. Convert it to the configured API origin for rendering without allowing an arbitrary origin.
- Produce `fetchCategories()` and `fetchDishes(query)` using the shared Task 1 request client. Query values must be URL encoded.

## Price formatting

Produce `formatCents(cents): string` using integer quotient/remainder and string grouping. Reject or safely handle invalid/non-integer/negative input consistently. Required cases:

```ts
formatCents(0) === "¥0.00"
formatCents(5) === "¥0.05"
formatCents(1299) === "¥12.99"
formatCents(9_999_999) === "¥99,999.99"
```

Never calculate totals with floating-point money arithmetic.

## Dish card

Typed properties are the public dish DTO plus `favorited`, with optional per-control pending state if the component API anticipates Task 4. Render a lazy image with local fallback, name, description, `参考价格`, a favorite control with visible state text, and `加入选择`. Emit only dish IDs via `favoritechange` and `add`; the component owns neither API calls nor draft/favorite state. On image error switch to a local placeholder. Controls meet a 44px minimum.

## Status view

Reusable presentational component for loading/skeleton, empty, error, and retry states. Emit a retry event; own no API logic.

## Menu page behavior

- Load categories and the first dish page together on first entry.
- Category selection resets cursor and replaces items.
- Search trims input, waits 300ms after the final keystroke, and resets cursor.
- Ignore stale response application with a monotonically increasing request number.
- Load at most 20 dishes per page; append cursor pages once, prevent duplicate concurrent loads, and stop at `nextCursor: null`.
- Implement skeleton loading, empty menu, empty search, recoverable network error, image fallback, pull-to-refresh, and scroll-to-bottom pagination.
- Preserve selected category and search text while navigating away and back during the same app session (module-level page state or a small session-only state module; do not persist it to storage).
- Render the warm food-journal visual direction using global tokens: calm paper background, ink-green category rail/chips, restrained cinnabar action accent, strong hierarchy, non-generic composition.
- No share handler.

Task 4 will connect favorite state; Task 5 will connect draft state. For now events and visual affordances must be ready without inventing those modules.

## Tests and TDD

Write tests first and record RED/GREEN evidence. At minimum test:

- all required price cases plus invalid boundary behavior;
- dish-card event payloads contain IDs only;
- image error selects the local fallback;
- search is trimmed/debounced and stale responses do not overwrite newer results;
- category change and pull-to-refresh reset pagination;
- pagination appends once and stops at null cursor;
- empty search differs from empty menu and retry is recoverable.

Use real utilities/controllers; mock only wx/component registration and the external API boundary. Run focused tests, then the complete miniapp tests and typecheck.

## Global constraints

- Native Mini Program only; pages never call `wx.request` directly.
- All users see the same published public menu.
- UI copy uses `选择`, `参考价格`, and list language only; never imply ordering, checkout, payment, fulfilment, merchant, table, pickup, or delivery.
- Prices are integer cents.
- No share, collaboration, user-created dish, or admin entry.
- Do not execute Git commands and do not commit.

