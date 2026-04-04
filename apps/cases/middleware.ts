import { NextResponse } from 'next/server';
import NextAuth from "next-auth"
import { authConfig } from "@zenowethu/shared-lib/src/auth";
import { logger } from "@zenowethu/shared-lib/src/logger";

const { auth } = NextAuth(authConfig)

/**
 * In-memory rate limiter for sensitive auth routes.
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

// Periodically clean up expired entries
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
    'Access-Control-Max-Age': '86400'
};

function applyCorsHeaders(response: NextResponse, allowedOrigin: string): void {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Vary', 'Origin');
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
        response.headers.set(k, v);
    }
}

// ─── Unified Middleware ───────────────────────────────────────────────────────

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const origin = req.headers.get('origin');
    const allowedOrigin = getAllowedOrigin(origin);

    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
        const preflightResponse = new NextResponse(null, { status: 204 });
        if (allowedOrigin) applyCorsHeaders(preflightResponse, allowedOrigin);
        return preflightResponse;
    }

    // 2. Auth Logic
    const isLoggedIn = !!req.auth
    const isOnLogin = pathname.startsWith('/login')
    const isOnForgotPassword = pathname.startsWith('/forgot-password')
    const isOnResetPassword = pathname.startsWith('/reset-password')
    const isApiAuth = pathname.startsWith('/api/auth')
    const isPublicApi = pathname.startsWith('/api/v1')
    const isSetupApi = pathname.startsWith('/api/setup')

    logger.info("[Middleware] " + req.method + " " + pathname + " - Authenticated: " + isLoggedIn);

    if (!isPublicApi && !isSetupApi) {
        // Restrict /admin access
        if (isLoggedIn && pathname.startsWith('/admin')) {
            const isAdmin = req.auth?.user?.isAdmin === true
            if (!isAdmin) {
                return NextResponse.redirect(new URL('/', req.url))
            }
        }

        // Redirect logged-in users away from login
        if (isLoggedIn && isOnLogin) {
            return NextResponse.redirect(new URL('/', req.url))
        }

        // Redirect non-logged-in users (except for password recovery pages)
        if (!isLoggedIn && !isOnLogin && !isOnForgotPassword && !isOnResetPassword && !isApiAuth) {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
            return NextResponse.redirect(new URL('/login', req.url))
        }
    }

    // 3. Rate Limiting
    const limit = getLimit(pathname);
    if (limit !== null) {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            req.headers.get('x-real-ip') ??
            '127.0.0.1';

        const key = `${ip}:${pathname}`;
        const now = Date.now();
        maybeCleanup();

        const record = rateLimitStore.get(key);

        if (!record || now > record.resetTime) {
            rateLimitStore.set(key, { count: 1, resetTime: now + WINDOW_MS });
        } else if (record.count >= limit) {
            const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
            return new NextResponse(
                JSON.stringify({ error: 'Too many requests. Please try again later.' }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(retryAfterSeconds)
                    }
                }
            );
        } else {
            record.count++;
        }
    }

    // 4. Pass through with CORS
    const response = NextResponse.next();
    if (pathname.startsWith('/api/') && allowedOrigin) {
        applyCorsHeaders(response, allowedOrigin);
    }
    return response;
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads|api/documents/upload).*)']
};
