/**
 * Minimal in-memory fixed-window rate limiter for auth-sensitive API routes
 * (login support endpoints, password reset, registration). Per-process only —
 * good enough for the current single-instance deployment; swap the store for
 * Redis when the platform scales horizontally.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Cap the map so a scanner cycling keys can't grow memory unbounded.
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets — suitable for a Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Consume one attempt for `key` (e.g. `reset:<ip>`). Allows `limit` attempts
 * per `windowMs` window.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      // Drop expired entries; if everything is live, reset the oldest wholesale.
      for (const [k, v] of windows) {
        if (v.resetAt <= now) windows.delete(k);
      }
      if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP from proxy headers (Traefik sets x-forwarded-for). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}

/** Test-only: clear all tracked windows. */
export function __resetRateLimiter(): void {
  windows.clear();
}
