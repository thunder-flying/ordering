import { expect, test } from "vitest";

import { PUBLIC_MENU_SEED } from "./seed-catalog";

test("seeds ordered fitness menus without the legacy home-cooking category", () => {
  expect(PUBLIC_MENU_SEED.map((category) => category.sortOrder)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  expect(PUBLIC_MENU_SEED.map((category) => category.name)).not.toContain(
    "家常菜",
  );

  const fitnessCategories = PUBLIC_MENU_SEED.filter((category) =>
    ["增肌健身餐", "减脂健身餐", "体型维持餐"].includes(category.name),
  );
  expect(fitnessCategories).toHaveLength(3);
  expect(fitnessCategories.flatMap((category) => category.dishes)).toHaveLength(
    12,
  );
});
