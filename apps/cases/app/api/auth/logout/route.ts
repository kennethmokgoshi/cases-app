import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/auth/logout');


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
