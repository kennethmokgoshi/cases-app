import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import crypto from 'crypto';
import { ForgotPasswordSchema, parseBody } from '@/lib/schemas';

import { z } from 'zod';

// Server-side logger for API routes
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export async function POST(request: NextRequest) {
    try {
        const parsed = parseBody(ForgotPasswordSchema, await request.json());
        if (!parsed.success) return parsed.response;
        const body = parsed.data as z.infer<typeof ForgotPasswordSchema>;
        const { email } = body;

        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            // Security: Don't reveal if user exists. Return success even if not found.
            return NextResponse.json({ message: 'If an account exists with this email, a reset link has been sent.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpires: expires
            }
        });

        // In a real production app, we would send an email here.
        // For development, we'll log it and also optionally return it if we want to test easily.
        const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

        logger.info(`[PASSWORD RESET] --- FOR EMAIL: ${email} ---`);
        logger.info(`[PASSWORD RESET] Token: ${token}`);
        logger.info(`[PASSWORD RESET] URL: ${resetUrl}`);
        logger.info(`-------------------------------------------`);

        return NextResponse.json({
            message: 'If an account exists with this email, a reset link has been sent.',
            debugToken: process.env.NODE_ENV === 'development' ? token : undefined
        });
    } catch (error) {
        logger.error('Forgot password API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
