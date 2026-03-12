import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    pages: {
        signIn: "/login" },
    session: {
        strategy: "jwt" },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id || ''
                token.firstName = user.firstName
                token.lastName = user.lastName
                token.organization = user.organization
                token.role = user.role
                token.isAdmin = user.isAdmin
                token.isExecutive = (user as any).isExecutive
                token.isSeniorManager = (user as any).isSeniorManager
                token.isManager = user.isManager
                token.userType = user.userType
                token.b2bPartnerId = user.b2bPartnerId
                token.avatarUrl = (user as any).avatarUrl
            }
            return token
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string
                session.user.firstName = token.firstName as string
                session.user.lastName = token.lastName as string
                session.user.organization = token.organization as string
                session.user.role = token.role as string
                session.user.isAdmin = token.isAdmin as boolean
                session.user.isExecutive = token.isExecutive as boolean
                session.user.isSeniorManager = token.isSeniorManager as boolean
                session.user.isManager = token.isManager as boolean
                session.user.userType = token.userType as string
                session.user.b2bPartnerId = token.b2bPartnerId as string | null
                session.user.avatarUrl = token.avatarUrl as string | null
            }
            return session
        }
    },
    providers: [], // Leave empty for Edge compatibility
    // Cookie configuration for SSO across subdomains
    cookies: {
        sessionToken: {
            name: process.env.NODE_ENV === 'production'
                ? '__Secure-authjs.session-token'
                : 'authjs.session-token',
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                domain: process.env.NODE_ENV === 'production'
                    ? '.zenowethu.co.za'
                    : undefined } },
        callbackUrl: {
            name: process.env.NODE_ENV === 'production'
                ? '__Secure-authjs.callback-url'
                : 'authjs.callback-url',
            options: {
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                domain: process.env.NODE_ENV === 'production'
                    ? '.zenowethu.co.za'
                    : undefined } },
        csrfToken: {
            name: process.env.NODE_ENV === 'production'
                ? '__Host-authjs.csrf-token'
                : 'authjs.csrf-token',
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production' } } } } satisfies NextAuthConfig
