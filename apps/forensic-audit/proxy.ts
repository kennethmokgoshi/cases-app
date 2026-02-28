import NextAuth from "next-auth"
import { authConfig } from "@zenowethu/shared-lib"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
    const isLoggedIn = !!req.auth
    const isOnLogin = req.nextUrl.pathname.startsWith('/login')
    const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')
    const isPublicApi = req.nextUrl.pathname.startsWith('/api/v1')
    const isSetupApi = req.nextUrl.pathname.startsWith('/api/setup')

    // Allow public API routes (v1 - uses API key auth instead) and setup
    if (isPublicApi || isSetupApi) {
        return NextResponse.next()
    }

    // Role-based access control for Forensic Audit App
    if (isLoggedIn) {
        const user = req.auth?.user as any;

        // Block B2B Partners - redirect to main Cases app B2B dashboard
        if (user?.userType === 'B2B_PARTNER') {
            const casesAppUrl = process.env.CASES_APP_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${casesAppUrl}/b2b-dashboard`);
        }
    }

    // Restrict /admin access to only admin users
    if (isLoggedIn && req.nextUrl.pathname.startsWith('/admin')) {
        const isAdmin = (req.auth?.user as any)?.isAdmin === true
        if (!isAdmin) {
            return NextResponse.redirect(new URL('/', req.url))
        }
    }

    // Redirect logged-in users away from login page
    if (isLoggedIn && isOnLogin) {
        return NextResponse.redirect(new URL('/', req.url))
    }

    // Redirect non-logged-in users to login page
    if (!isLoggedIn && !isOnLogin && !isApiAuth) {
        if (req.nextUrl.pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
})

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'] }
