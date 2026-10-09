// Staff (User) password reset — shared by every staff app's
// /api/auth/forgot-password and /api/auth/reset-password routes.
// Node-only (Prisma + email) — import by deep path, never from the package root.
//
// Only a SHA-256 hash of the reset token is stored and the raw token is never
// logged: it only ever leaves the server inside the reset email.

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { getCompanyProfile } from '../company/company-profile-service';
import { renderBrandedEmail } from '../notifications/templates';
import { sendTransactionalEmail } from '../notifications/service';

const logger = createLogger('auth/staff-password-reset');

export const STAFF_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function hashStaffResetToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Create a reset token for the user with this email and email them the link.
 * Resolves silently when no such user exists so callers cannot enumerate accounts.
 */
export async function requestStaffPasswordReset(
    email: string,
    appUrl: string,
): Promise<{ emailSent: boolean }> {
    const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, email: true, firstName: true },
    });
    if (!user?.email) return { emailSent: false };

    const rawToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
        where: { id: user.id },
        data: {
            resetPasswordToken: hashStaffResetToken(rawToken),
            resetPasswordExpires: new Date(Date.now() + STAFF_RESET_TOKEN_TTL_MS),
        },
    });

    const link = `${appUrl.replace(/\/+$/, '')}/reset-password?token=${rawToken}`;
    const company = await getCompanyProfile();
    const html = renderBrandedEmail(
        `
      <h2 style="margin:0 0 15px;color:#0B1D35;font-size:22px;">Reset your password</h2>
      <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6">
        Hi ${escapeHtml(user.firstName || 'there')}, we received a request to reset the password for your
        ${escapeHtml(company.tradingName)} staff account. Click the button below to choose a new password.
      </p>
      <p style="margin:0 0 8px;color:#94A3B8;font-size:13px;">
        This link expires in 1 hour and can be used once. If you did not request this, you can safely ignore this email — your password will not change.
      </p>
    `,
        {
            title: 'Reset your password',
            previewText: 'Choose a new password for your staff account.',
            button: { text: 'Reset my password →', url: link },
            company,
        },
    );

    const result = await sendTransactionalEmail({ to: user.email, subject: 'Reset your password', html });
    if (!result.emailSuccess) {
        logger.error({ userId: user.id, errors: result.errors }, 'Failed to send staff password reset email');
    } else {
        logger.info({ userId: user.id }, 'Staff password reset email sent');
    }
    return { emailSent: result.emailSuccess };
}

/**
 * Consume a reset token and set the new password.
 * Returns false when the token is unknown or expired.
 */
export async function resetStaffPassword(rawToken: string, newPassword: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
        where: {
            resetPasswordToken: hashStaffResetToken(rawToken),
            resetPasswordExpires: { gt: new Date() },
        },
        select: { id: true },
    });
    if (!user) return false;

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: await bcrypt.hash(newPassword, 10),
            resetPasswordToken: null,
            resetPasswordExpires: null,
        },
    });
    logger.info({ userId: user.id }, 'Staff password reset completed');
    return true;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
    ));
}
