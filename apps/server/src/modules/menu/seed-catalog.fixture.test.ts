import { expect, test } from "vitest";

import { PUBLIC_MENU_SEED, validateSeedCatalog } from "./seed-catalog";

  test("ships nine ordered categories and thirty-nine image-backed dishes", () => {
  expect(PUBLIC_MENU_SEED).toHaveLength(9);
  const dishes = PUBLIC_MENU_SEED.flatMap((category) => category.dishes);
    expect(dishes).toHaveLength(39);
  expect(new Set(dishes.map((dish) => dish.assetFileName)).size).toBe(39);
  expect(() => validateSeedCatalog(PUBLIC_MENU_SEED)).not.toThrow();
});
