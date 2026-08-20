import { ApiError } from "../http/api-error";

export type RateRule = {
  limit: number;
  windowMs: number;
};

type Window = {
  count: number;
  startedAt: number;
};

const windows = new Map<string, Window>();

function pruneExpiredWindows(now: number) {
  if (windows.size < 10_000) {
    return;
  }

  for (const [key, window] of windows) {
    if (now - window.startedAt >= 60 * 60 * 1_000) {
      windows.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  rule: RateRule,
  now = Date.now(),
): void {
  if (rule.limit < 1 || rule.windowMs < 1) {
    throw new RangeError("Rate limit values must be positive");
  }

  pruneExpiredWindows(now);
  const current = windows.get(key);

  if (!current || now - current.startedAt >= rule.windowMs) {
    windows.set(key, { count: 1, startedAt: now });
    return;
  }

  if (current.count >= rule.limit) {
    throw new ApiError("RATE_LIMITED", "请求过于频繁，请稍后重试", 429);
  }

  current.count += 1;
}
