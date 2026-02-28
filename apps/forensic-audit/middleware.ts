import { NextRequest, NextResponse } from 'next/server';

/**
 * In-memory rate limiter for sensitive auth routes.
 *
 * ⚠️  This is a single-instance rate limiter suitable for single-server Docker deployments.
 *     For multi-instance / Kubernetes deployments, replace with a Redis-backed solution
 *     (e.g., @upstash/ratelimit with Upstash Redis).
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// 15-minute sliding window
const WINDOW_MS = 15 * 60 * 1000;

// Max requests per IP per window, keyed by route prefix
const RATE_LIMITS: Record<string, number> = {
  '/api/auth/forgot-password': 5,   // 5 password reset emails per 15 min
  '/api/auth/reset-password': 10,   // 10 reset attempts per 15 min
  '/api/auth/signin': 20,           // 20 sign-in attempts per 15 min
  '/api/cases': 60,                 // 60 case operations per 15 min
  '/api/documents/analyze': 10,     // 10 AI analyses per 15 min (cost control)
};

// Periodically clean up expired entries to prevent unbounded memory growth
let cleanupCounter = 0;
function maybeCleanup() {
  if (++cleanupCounter % 200 !== 0) return;
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetTime) rateLimitStore.delete(key);
  }
}

function getLimit(pathname: string): number | null {
  for (const [route, limit] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(route)) return limit;
  }
  return null;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const limit = getLimit(pathname);

  // Not a rate-limited route — pass through
  if (limit === null) return NextResponse.next();

  // Prefer the real client IP from reverse-proxy headers
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  const key = `${ip}:${pathname}`;
  const now = Date.now();

  maybeCleanup();

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    // First request in this window
    rateLimitStore.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return NextResponse.next();
  }

  if (record.count >= limit) {
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(record.resetTime / 1000))
        }
      }
    );
  }

  record.count++;
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/signin',
    '/api/cases',
    '/api/documents/analyze',
  ]
};
