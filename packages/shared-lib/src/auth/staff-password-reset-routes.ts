// Route handlers for staff /api/auth/forgot-password and /api/auth/reset-password.
// Each staff app re-exports these. Node-only — import by deep path.

import { NextRequest, NextResponse } from 'next/server';
import { ForgotPasswordSchema, ResetPasswordSchema } from '../schemas';
import { createLogger } from '../logger';
import { checkRateLimit, clientIpFromHeaders } from './rate-limit';
import { requestStaffPasswordReset, resetStaffPassword } from './staff-password-reset';

const logger = createLogger('api/auth/password-reset');

const GENERIC_MESSAGE = 'If an account exists with this email, a reset link has been sent.';

function appUrlFor(request: NextRequest): string {
    return process.env.NEXTAUTH_URL || new URL(request.url).origin;
}

/** POST /api/auth/forgot-password — always returns the same generic message. */
export async function forgotPasswordPOST(request: NextRequest): Promise<NextResponse> {
    const ip = clientIpFromHeaders(request.headers);
    const rate = checkRateLimit(`staff-forgot-password:${ip}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many reset requests. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
        );
    }

    const parsed = ForgotPasswordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Valid email is required' }, { status: 400 });
    }

    try {
        await requestStaffPasswordReset(parsed.data.email, appUrlFor(request));
    } catch (error) {
        // Still generic — never reveal whether the account exists or why it failed.
        logger.error({ err: error }, 'Forgot password request failed');
    }
    return NextResponse.json({ message: GENERIC_MESSAGE });
}

/** POST /api/auth/reset-password */
export async function resetPasswordPOST(request: NextRequest): Promise<NextResponse> {
    const ip = clientIpFromHeaders(request.headers);
    const rate = checkRateLimit(`staff-reset-password:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
        );
    }

    const parsed = ResetPasswordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    try {
        const ok = await resetStaffPassword(parsed.data.token, parsed.data.password);
        if (!ok) {
            return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
        }
        return NextResponse.json({ message: 'Password has been reset successfully' });
    } catch (error) {
        logger.error({ err: error }, 'Reset password failed');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
