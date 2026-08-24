import { describe, expect, it } from "vitest";

import appConfig from "../src/app.json";

describe("native tab bar", () => {
  it("provides normal and selected icons for every tab", () => {
    expect(appConfig.tabBar.list).toHaveLength(4);

    for (const item of appConfig.tabBar.list) {
      expect(item).toEqual(
        expect.objectContaining({
          iconPath: expect.stringMatching(/^assets\/tab-bar\/.+\.png$/),
          selectedIconPath: expect.stringMatching(/^assets\/tab-bar\/.+-selected\.png$/),
        }),
      );
    }
  });
});
