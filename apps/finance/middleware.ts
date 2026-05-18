import { NextResponse } from 'next/server';
import NextAuth from "next-auth"
import { authConfig } from "@zenowethu/shared-lib/src/auth";

const { auth } = NextAuth(authConfig)

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

// ─── Middleware ───────────────────────────────────────────────────────────────

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

    // 2. Auth logic
    const isLoggedIn = !!req.auth;
    const isOnLogin = pathname.startsWith('/login');
    const isOnForgotPassword = pathname.startsWith('/forgot-password');
    const isOnResetPassword = pathname.startsWith('/reset-password');
    const isApiAuth = pathname.startsWith('/api/auth');
    const isPublicApi = pathname.startsWith('/api/v1');

    if (!isPublicApi) {
        // Restrict /admin routes to admins only
        if (isLoggedIn && pathname.startsWith('/admin')) {
            const isAdmin = req.auth?.user?.isAdmin === true;
            if (!isAdmin) {
                return NextResponse.redirect(new URL('/', req.url));
            }
        }

        // Redirect logged-in users away from login
        if (isLoggedIn && isOnLogin) {
            return NextResponse.redirect(new URL('/', req.url));
        }

        // Redirect unauthenticated users to login
        if (!isLoggedIn && !isOnLogin && !isOnForgotPassword && !isOnResetPassword && !isApiAuth) {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            return NextResponse.redirect(new URL('/login', req.url));
        }
    }

    // 3. Pass through with CORS headers
    const response = NextResponse.next();
    if (pathname.startsWith('/api/') && allowedOrigin) {
        applyCorsHeaders(response, allowedOrigin);
    }
    return response;
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)']
};
