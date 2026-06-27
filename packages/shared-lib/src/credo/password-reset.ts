import bcrypt from 'bcryptjs';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { renderBrandedEmail } from '../notifications/templates';
import { sendTransactionalEmail } from '../notifications/service';
import { createPasswordResetTokenForConsumer, hashResetToken } from './consumer-provisioning';

const logger = createLogger('credo/password-reset');

const CREDO_URL = process.env.CREDO_URL || 'https://credo.zenowethu.co.za';

export interface RequestResetResult {
  /** Always true unless an actual send error occurred — callers must NOT leak account existence. */
  ok: boolean;
  /** Internal-only: whether an email was actually dispatched. Do not surface to the client. */
  emailSent: boolean;
}

/**
 * Start a password reset / "get my password" flow. The username is the 13-digit SA ID
 * number (email/phone are not unique and cannot identify a single consumer). We look the
 * consumer up by ID number and email a one-time reset link to the address on file.
 *
 * To avoid leaking which IDs are registered, the public-facing result is always success;
 * the email is only sent when a matching account with a real email exists.
 */
export async function requestPasswordReset(idNumber: string): Promise<RequestResetResult> {
  const id = idNumber.trim();
  if (!/^\d{13}$/.test(id)) {
    return { ok: true, emailSent: false };
  }

  const consumer = await prisma.consumerAccount.findUnique({
    where: { idNumber: id },
    select: { id: true, email: true, firstName: true },
  });

  if (!consumer || !consumer.email || consumer.email.endsWith('@no-email.zenowethu.co.za')) {
    // No account, or no deliverable email on file. Staff must add an email before
    // the consumer can self-serve. Still return ok to avoid enumeration.
    if (consumer) logger.warn(`Password reset requested for consumer ${consumer.id} with no deliverable email`);
    return { ok: true, emailSent: false };
  }

  const rawToken = await createPasswordResetTokenForConsumer(consumer.id);
  const link = `${CREDO_URL}/reset-password?token=${rawToken}`;

  const html = renderBrandedEmail(
    `
      <h2 style="margin:0 0 15px;color:#0B1D35;font-size:22px;">Reset your Credo password</h2>
      <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6">
        Hi ${consumer.firstName}, we received a request to set or reset the password for your
        Credo profile. Click the button below to choose a new password.
      </p>
      <p style="margin:0 0 8px;color:#94A3B8;font-size:13px;">
        This link expires in 7 days and can be used once. If you did not request this, you can safely ignore this email — your password will not change.
      </p>
      <p style="margin:16px 0 0;color:#64748B;font-size:14px;">Remember: your Credo username is your 13-digit SA ID number.</p>
    `,
    {
      title: 'Reset your Credo password',
      previewText: 'Choose a new password for your Credo profile.',
      button: { text: 'Reset my password →', url: link },
      companyName: 'Zenowethu Consulting (Credo)',
    },
  );

  const result = await sendTransactionalEmail({
    to: consumer.email,
    subject: 'Reset your Credo password',
    html,
  });

  if (!result.emailSuccess) {
    logger.error(`Failed to send reset email to consumer ${consumer.id}: ${result.errors.join('; ')}`);
  }
  return { ok: true, emailSent: result.emailSuccess };
}

export type ResetTokenStatus = 'VALID' | 'NOT_FOUND' | 'EXPIRED' | 'USED';

export async function validateResetToken(rawToken: string): Promise<{ status: ResetTokenStatus; consumerId?: string }> {
  if (!rawToken) return { status: 'NOT_FOUND' };
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(rawToken) },
    select: { id: true, consumerId: true, expiresAt: true, usedAt: true },
  });
  if (!record) return { status: 'NOT_FOUND' };
  if (record.usedAt) return { status: 'USED' };
  if (record.expiresAt.getTime() < Date.now()) return { status: 'EXPIRED' };
  return { status: 'VALID', consumerId: record.consumerId };
}

/**
 * Consume a reset token and set the new password. Marks the token used, activates the
 * account, and invalidates any other outstanding tokens for the consumer.
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  const tokenHash = hashResetToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, consumerId: true, expiresAt: true, usedAt: true },
  });
  if (!record) return { ok: false, error: 'This reset link is invalid.' };
  if (record.usedAt) return { ok: false, error: 'This reset link has already been used.' };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, error: 'This reset link has expired.' };

  const hashed = await bcrypt.hash(newPassword, 12);
  const now = new Date();

  await prisma.$transaction([
    prisma.consumerAccount.update({
      where: { id: record.consumerId },
      data: { password: hashed, activatedAt: now, isVerified: true },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
    // Invalidate any other outstanding tokens for this consumer.
    prisma.passwordResetToken.updateMany({
      where: { consumerId: record.consumerId, usedAt: null, id: { not: record.id } },
      data: { usedAt: now },
    }),
  ]);

  logger.info(`Password set for consumer ${record.consumerId} via reset token`);
  return { ok: true };
}
