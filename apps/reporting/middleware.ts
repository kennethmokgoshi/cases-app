import { NextResponse } from 'next/server';
import NextAuth from "next-auth";
import { authConfig } from "@zenowethu/shared-lib/src/auth";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const isLoggedIn = !!req.auth;

    const isOnLogin = pathname.startsWith('/login');
    const isApiAuth = pathname.startsWith('/api/auth');

    // 1. Redirect logged-in users away from login
    if (isLoggedIn && isOnLogin) {
        return NextResponse.redirect(new URL('/', req.url));
    }

    // 2. Redirect unauthenticated users to login
    if (!isLoggedIn && !isOnLogin && !isApiAuth) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', req.url));
    }

    // 3. Restrict /manager dashboard to Admin or Executive staff
    if (isLoggedIn && pathname.startsWith('/manager')) {
        const isExecutive = req.auth?.user?.isExecutive === true || req.auth?.user?.isAdmin === true;
        if (!isExecutive) {
            return NextResponse.redirect(new URL('/', req.url));
        }
    }

    // 4. Enforce that only STAFF users (employees) can use the reporting app
    if (isLoggedIn && req.auth?.user?.userType !== 'STAFF') {
        // If it's an API call, return error, otherwise show unauthorized redirect/state
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Access Denied: Staff only' }, { status: 403 });
        }
        // Force redirect to a state where they are notified
        return NextResponse.redirect(new URL('/login?error=Access%20Denied%3A%20Staff%20only', req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
