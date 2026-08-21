import { describe, expect, test } from "vitest";

import { validateSeedCatalog } from "./seed-catalog";

describe("public menu seed catalog", () => {
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
