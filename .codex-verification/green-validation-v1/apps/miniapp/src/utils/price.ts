function requireSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Price values must be non-negative safe integers");
  }
}

export function formatCents(cents: number): string {
  requireSafeInteger(cents);
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `¥${whole}.${(cents % 100).toString().padStart(2, "0")}`;
}

export function multiplyCents(cents: number, quantity: number): number {
  requireSafeInteger(cents);
  requireSafeInteger(quantity);
  const total = cents * quantity;
  requireSafeInteger(total);
  return total;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => {
    requireSafeInteger(value);
    const next = total + value;
    requireSafeInteger(next);
    return next;
  }, 0);
}
