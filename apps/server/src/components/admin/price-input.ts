const PRICE_INPUT = /^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/;

export function parsePriceCents(value: string): number {
  const normalized = value.trim();
  if (!PRICE_INPUT.test(normalized)) {
    throw new Error("参考价格须为 0.00 到 99999.99 元，最多两位小数。");
  }
  const [yuan, fraction = ""] = normalized.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isInteger(cents) || cents > 9_999_999) {
    throw new Error("参考价格超出允许范围。");
  }
  return cents;
}

export function formatPriceCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
