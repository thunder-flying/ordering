import { describe, expect, it } from "vitest";

import { formatCents, multiplyCents, sumCents } from "../../src/utils/price";

describe("integer price utilities", () => {
  it.each([[0, "¥0.00"], [5, "¥0.05"], [1299, "¥12.99"], [9_999_999, "¥99,999.99"]])("formats %i cents as %s", (cents, expected) => expect(formatCents(cents)).toBe(expected));

  it("multiplies and totals only safe integers", () => {
    expect(multiplyCents(1299, 2)).toBe(2598);
    expect(sumCents([5, 1299, 9_999_999])).toBe(10_001_303);
    expect(() => multiplyCents(1.5, 2)).toThrow("safe integer");
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow("safe integer");
  });
});
