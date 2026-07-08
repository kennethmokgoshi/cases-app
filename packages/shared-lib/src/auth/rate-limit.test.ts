import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkRateLimit, clientIpFromHeaders, __resetRateLimiter } from './rate-limit';

beforeEach(() => {
  __resetRateLimiter();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows requests up to the limit and blocks beyond it', () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('k', 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit('k', 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    expect(checkRateLimit('a', 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit('a', 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit('b', 1, 60_000).allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    vi.useFakeTimers();
    expect(checkRateLimit('k', 1, 1_000).allowed).toBe(true);
    expect(checkRateLimit('k', 1, 1_000).allowed).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit('k', 1, 1_000).allowed).toBe(true);
  });
});

describe('clientIpFromHeaders', () => {
  it('uses the first x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '41.0.0.1, 10.0.0.2' });
    expect(clientIpFromHeaders(h)).toBe('41.0.0.1');
  });

  it('falls back to x-real-ip then "unknown"', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '41.0.0.9' }))).toBe('41.0.0.9');
    expect(clientIpFromHeaders(new Headers())).toBe('unknown');
  });
});
