import { expect, test } from "vitest";

import { PUBLIC_MENU_SEED, validateSeedCatalog } from "./seed-catalog";

test("ships nine ordered categories and thirty-six image-backed dishes", () => {
  expect(PUBLIC_MENU_SEED).toHaveLength(9);
  const dishes = PUBLIC_MENU_SEED.flatMap((category) => category.dishes);
  expect(dishes).toHaveLength(36);
  expect(new Set(dishes.map((dish) => dish.assetFileName)).size).toBe(36);
  expect(() => validateSeedCatalog(PUBLIC_MENU_SEED)).not.toThrow();
});
