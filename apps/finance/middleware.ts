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

// ─── CORS ────────────────────────────────────────────────────────────────────
// Comma-separated list of origins allowed to call this app's APIs cross-domain.
// In production, set CORS_ALLOWED_ORIGINS in your environment.
// Example: CORS_ALLOWED_ORIGINS=https://cases.zenowethu.co.za,https://insurance.zenowethu.co.za
const ALLOWED_ORIGINS: string[] = (
    process.env.CORS_ALLOWED_ORIGINS ??
    'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004'
)
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

function getAllowedOrigin(origin: string | null): string | null {
    if (!origin) return null;
    return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    'Access-Control-Max-Age': '86400', // 24 hours preflight cache
};

function applyCorsHeaders(response: NextResponse, allowedOrigin: string): void {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Vary', 'Origin');
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
        response.headers.set(k, v);
    }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const origin = request.headers.get('origin');
    const allowedOrigin = getAllowedOrigin(origin);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
        const preflightResponse = new NextResponse(null, { status: 204 });
        if (allowedOrigin) applyCorsHeaders(preflightResponse, allowedOrigin);
        return preflightResponse;
    }

    // Rate limiting for sensitive auth routes
    const limit = getLimit(pathname);
    if (limit !== null) {
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
        } else if (record.count >= limit) {
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
        } else {
            record.count++;
        }
    }

    // Pass through — add CORS headers to all API responses
    const response = NextResponse.next();
    if (pathname.startsWith('/api/') && allowedOrigin) {
        applyCorsHeaders(response, allowedOrigin);
    }
    return response;
}

export const config = {
    // Run on all API routes: enables CORS for every /api response
    // and applies rate limiting for the specific auth routes above
    matcher: ['/api/:path*']
};
