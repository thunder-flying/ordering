import { describe, expect, it } from "vitest";

import { AdminDishSearch, DishInput } from "./dishes";

describe("dish contracts", () => {
  it("normalizes dish text and boolean query parameters", () => {
    const id = "cmt0zapt70000wcmdx75rhyss";
    expect(
      DishInput.parse({
        categoryId: id,
        description: " 简介 ",
        imageUploadId: id,
        name: " 番茄炒蛋 ",
        published: true,
        referencePriceCents: 1_800,
        sortOrder: 1,
      }),
    ).toMatchObject({ description: "简介", name: "番茄炒蛋" });
    expect(AdminDishSearch.parse({ published: "false" })).toMatchObject({
      includeDeleted: false,
      published: false,
    });
  });
});
