export function newIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2);
  return `idem-${Date.now().toString(36)}-${random}`;
}
