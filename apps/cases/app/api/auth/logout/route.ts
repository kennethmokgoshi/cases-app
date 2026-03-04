import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};


export async function POST() {
    try {
        // Clear all NextAuth cookies
        const cookieStore = await cookies();

        // Get all cookies and delete NextAuth related ones
        const allCookies = cookieStore.getAll();

        for (const cookie of allCookies) {
            if (cookie.name.startsWith('next-auth') || cookie.name.startsWith('__Secure-next-auth')) {
                cookieStore.delete(cookie.name);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Logout error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to logout'
        }, { status: 500 });
    }
}
