import { createHash, randomBytes } from 'crypto';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';
import { renderBrandedEmail } from '../notifications/templates';
import { sendTransactionalEmail } from '../notifications/service';

const logger = createLogger('credo/provisioning');

const CREDO_URL = process.env.CREDO_URL || 'https://credo.zenowethu.co.za';
// Password-reset / activation links are valid for 7 days. Activation invites for
// auto-provisioned accounts use the same token mechanism, so a generous window
// avoids locking out consumers who open the email a few days later.
const RESET_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface ProvisionResult {
  consumerId: string;
  created: boolean;
  /** Raw activation token — only present when a NEW account was created. */
  activationToken: string | null;
}

/**
 * Ensure a Credo ConsumerAccount exists for the given Client. Idempotent: if the
 * client already has a linked account (or one already exists for the same ID
 * number) nothing is created. Auto-provisioned accounts have NO password — the
 * consumer activates by following the emailed reset/activation link.
 *
 * The ID number is the canonical Credo username, so it is required to provision.
 */
export async function provisionConsumerForClient(clientId: string): Promise<ProvisionResult | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, idNumber: true },
  });
  if (!client) {
    logger.warn(`provisionConsumerForClient: client ${clientId} not found`);
    return null;
  }
  // ID number is the only username — without it the consumer could never log in.
  if (!client.idNumber || !/^\d{13}$/.test(client.idNumber)) {
    logger.info(`Skipping Credo provisioning for client ${clientId}: no valid 13-digit ID number`);
    return null;
  }

  // Already linked to this client?
  const linked = await prisma.consumerAccount.findUnique({
    where: { linkedClientId: client.id },
    select: { id: true },
  });
  if (linked) return { consumerId: linked.id, created: false, activationToken: null };

  // An account may already exist for this ID number but not yet be linked.
  const byId = await prisma.consumerAccount.findUnique({
    where: { idNumber: client.idNumber },
    select: { id: true, linkedClientId: true },
  });
  if (byId) {
    if (!byId.linkedClientId) {
      await prisma.consumerAccount.update({
        where: { id: byId.id },
        data: { linkedClientId: client.id },
      });
    }
    return { consumerId: byId.id, created: false, activationToken: null };
  }

  const consumer = await prisma.consumerAccount.create({
    data: {
      email: client.email || `${client.idNumber}@no-email.zenowethu.co.za`,
      password: null,
      firstName: client.firstName,
      lastName: client.lastName,
      idNumber: client.idNumber,
      phone: client.phone,
      linkedClientId: client.id,
      source: 'AUTO_PROVISIONED',
    },
    select: { id: true },
  });

  const activationToken = await createPasswordResetTokenForConsumer(consumer.id);
  logger.info(`Provisioned Credo profile ${consumer.id} for client ${client.id} (ID ${client.idNumber.slice(0, 6)}***)`);
  return { consumerId: consumer.id, created: true, activationToken };
}

/** Create a single-use reset/activation token and return the RAW token (store only the hash). */
export async function createPasswordResetTokenForConsumer(consumerId: string): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      consumerId,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

/**
 * Send the activation invite for a freshly auto-provisioned account. Only sends to a
 * real email address (skips the synthetic `@no-email` placeholder).
 */
export async function sendActivationInvite(params: {
  consumerId: string;
  email: string;
  firstName: string;
  rawToken: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!params.email || params.email.endsWith('@no-email.zenowethu.co.za')) {
    return { sent: false, reason: 'no-email-on-file' };
  }
  const link = `${CREDO_URL}/reset-password?token=${params.rawToken}`;
  const html = renderBrandedEmail(
    `
      <h2 style="margin:0 0 15px;color:#0B1D35;font-size:22px;">Your Credo profile is ready, ${params.firstName}</h2>
      <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6">
        Zenowethu has created a secure Credo profile for you. Credo lets you track your case,
        upload required documents, view quotes and chat with our AI Credit Coach — all in one place.
      </p>
      <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6">
        To get started, set your password using the button below. <strong>Your username is your
        13-digit SA ID number.</strong>
      </p>
      <p style="margin:0 0 8px;color:#94A3B8;font-size:13px;">This link expires in 7 days. If you did not expect this, you can ignore this email.</p>
    `,
    {
      title: 'Activate your Credo profile',
      previewText: 'Set your password to access your Credo profile.',
      button: { text: 'Set my password →', url: link },
      companyName: 'Zenowethu Consulting (Credo)',
    },
  );

  const result = await sendTransactionalEmail({
    to: params.email,
    subject: 'Activate your Credo profile — set your password',
    html,
  });
  return { sent: result.emailSuccess, reason: result.errors.join('; ') || undefined };
}

/**
 * Convenience: provision a Credo profile for a client AND fire the activation invite
 * email (non-blocking-safe — returns once the email attempt resolves). Safe to call
 * from case-creation flows; it never throws (errors are logged and swallowed) so it
 * cannot break case creation.
 */
export async function provisionAndInviteConsumer(clientId: string): Promise<ProvisionResult | null> {
  try {
    const result = await provisionConsumerForClient(clientId);
    if (result?.created && result.activationToken) {
      const consumer = await prisma.consumerAccount.findUnique({
        where: { id: result.consumerId },
        select: { email: true, firstName: true },
      });
      if (consumer) {
        await sendActivationInvite({
          consumerId: result.consumerId,
          email: consumer.email,
          firstName: consumer.firstName,
          rawToken: result.activationToken,
        }).catch((err) => logger.error('Activation invite failed:', err));
      }
    }
    return result;
  } catch (err) {
    logger.error(`provisionAndInviteConsumer failed for client ${clientId}:`, err);
    return null;
  }
}
