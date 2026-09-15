import { describe, expect, test } from "vitest";

import { PUBLIC_MENU_SEED, validateSeedCatalog } from "./seed-catalog";

describe("public menu seed catalog", () => {
  test("includes the requested northeastern dishes in the home-style category", () => {
    const category = PUBLIC_MENU_SEED.find((item) => item.name === "家常热菜");
    const dishes = category?.dishes.filter((dish) =>
      ["猪肉炖粉条", "东北大乱炖"].includes(dish.name),
    );

    expect(dishes).toEqual([
      {
        assetFileName: "pork-vermicelli-stew.webp",
        description: "五花肉与粉条一锅慢炖，汤汁浓郁，粉条吸满肉香。",
        name: "猪肉炖粉条",
        priceCents: 2_680,
      },
      {
        assetFileName: "northeast-stew.webp",
        description: "土豆、茄子、豆角和五花肉一锅炖煮，家常浓郁，热乎下饭。",
        name: "东北大乱炖",
        priceCents: 3_280,
      },
    ]);
  });

  test("rejects duplicate dish names within a category", () => {
    expect(() =>
      validateSeedCatalog([
        {
          dishes: [
            {
              assetFileName: "dish-one.webp",
              description: "第一道测试菜品",
              name: "测试菜",
              priceCents: 1_800,
            },
            {
              assetFileName: "dish-two.webp",
              description: "同名的第二道测试菜品",
              name: "测试菜",
              priceCents: 2_000,
            },
          ],
          name: "测试分类",
          sortOrder: 1,
        },
      ]),
    ).toThrow("同一分类下的菜品名称不能重复");
  });
});
