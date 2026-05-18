import NextAuth from "next-auth"
import { authConfig } from "@zenowethu/shared-lib/src/auth"
import { NextResponse } from "next/server"

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

// ─── Proxy ───────────────────────────────────────────────────────────────
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

    const isLoggedIn = !!req.auth
    const isOnLogin = pathname.startsWith('/login')
    const isOnForgotPassword = pathname.startsWith('/forgot-password')
    const isOnResetPassword = pathname.startsWith('/reset-password')
    const isApiAuth = pathname.startsWith('/api/auth')
    const isPublicApi = pathname.startsWith('/api/v1')
    const isSetupApi = pathname.startsWith('/api/setup')

    // Allow public API routes (v1 - uses API key auth instead) and setup
    if (isPublicApi || isSetupApi) {
        const response = NextResponse.next();
        if (allowedOrigin) applyCorsHeaders(response, allowedOrigin);
        return response;
    }

    // Role-based access control for Finance App
    if (isLoggedIn) {
        const user = req.auth?.user as any;

        // Block B2B Partners - redirect to main Cases app B2B dashboard
        const casesAppUrl = process.env.CASES_APP_URL || 'http://localhost:3000';
        if (user?.userType === 'B2B_PARTNER') {
            return NextResponse.redirect(`${casesAppUrl}/b2b-dashboard`);
        }

        // Access is open to all other internal staff roles.
    }

    // Restrict /admin access to only admin users
    if (isLoggedIn && pathname.startsWith('/admin')) {
        const isAdmin = req.auth?.user?.isAdmin === true;
        if (!isAdmin) {
            return NextResponse.redirect(new URL('/', req.url));
        }
    }

    // Redirect logged-in users away from login page
    if (isLoggedIn && isOnLogin) {
        return NextResponse.redirect(new URL('/', req.url));
    }

    // Redirect non-logged-in users to login page
    if (!isLoggedIn && !isOnLogin && !isOnForgotPassword && !isOnResetPassword && !isApiAuth) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', req.url));
    }

    const response = NextResponse.next();
    if (pathname.startsWith('/api/') && allowedOrigin) {
        applyCorsHeaders(response, allowedOrigin);
    }
    return response;
})

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)']
}
