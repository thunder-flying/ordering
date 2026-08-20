import { describe, expect, it } from "vitest";

import { calculateListTotal } from "./list-calculator";

describe("calculateListTotal", () => {
  it("uses integer cents and quantities", () => {
    expect(
      calculateListTotal([
        { dishId: "dish-a", priceCents: 1_299, quantity: 2 },
        { dishId: "dish-b", priceCents: 500, quantity: 3 },
      ]),
    ).toBe(4_098);
  });

  it("rejects duplicate dish IDs", () => {
    expect(() =>
      calculateListTotal([
        { dishId: "dish-a", priceCents: 500, quantity: 1 },
        { dishId: "dish-a", priceCents: 500, quantity: 2 },
      ]),
    ).toThrow(/duplicate/i);
  });
});
