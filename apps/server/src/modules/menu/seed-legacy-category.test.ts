import { expect, test } from "vitest";

import { selectRetirableLegacyCategoryIds } from "./seed-legacy-category";

test("retires only empty legacy seed categories", () => {
  expect(
    selectRetirableLegacyCategoryIds([
      { dishCount: 0, id: "legacy-empty", name: "家常菜" },
      { dishCount: 1, id: "legacy-in-use", name: "家常菜" },
      { dishCount: 0, id: "current-empty", name: "家常热菜" },
    ]),
  ).toEqual(["legacy-empty"]);
});
