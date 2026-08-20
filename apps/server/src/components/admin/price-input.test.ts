import { describe, expect, it } from "vitest";

import { formatPriceCents, parsePriceCents } from "./price-input";

describe("administrator price input", () => {
  it("converts at most two decimals to integer cents", () => {
    expect(parsePriceCents("12.99")).toBe(1_299);
    expect(parsePriceCents("0.5")).toBe(50);
    expect(formatPriceCents(1_299)).toBe("12.99");
  });

  it("rejects fractional cents and out-of-range prices", () => {
    expect(() => parsePriceCents("1.999")).toThrow();
    expect(() => parsePriceCents("100000.00")).toThrow();
  });
});
