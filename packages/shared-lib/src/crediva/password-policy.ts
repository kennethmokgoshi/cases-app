import bcrypt from 'bcryptjs';
import { prisma } from '@zenowethu/database';
import { createLogger } from '../logger';

const logger = createLogger('credo/password-policy');

/**
 * Default password issued to every auto-provisioned Credo client profile.
 * It is a shared, publicly known value — safe ONLY because `mustChangePassword`
 * forces a change on first login before any portal feature is reachable.
 */
export const DEFAULT_CONSUMER_PASSWORD = 'Client@100New';

/** A consumer may not reuse any of their last N passwords (current + history). */
export const PASSWORD_HISTORY_LIMIT = 5;

export const BCRYPT_COST = 12;

/** Consecutive failed logins before the account is temporarily locked. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
/** How long a lockout lasts once triggered. */
export const LOCKOUT_MINUTES = 15;

// Hash of the default password is stable per process — cache it so bulk
// provisioning/backfill doesn't pay the bcrypt cost per account.
let defaultPasswordHashPromise: Promise<string> | null = null;
export function getDefaultPasswordHash(): Promise<string> {
  if (!defaultPasswordHashPromise) {
    defaultPasswordHashPromise = bcrypt.hash(DEFAULT_CONSUMER_PASSWORD, BCRYPT_COST);
  }
  return defaultPasswordHashPromise;
}

export interface PasswordStrengthResult {
  ok: boolean;
  error?: string;
}

/**
 * Minimum strength for any consumer-chosen password: 8+ chars with upper,
 * lower and a digit. The shared default password is always rejected.
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { ok: false, error: 'Password must be 128 characters or fewer' };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return {
      ok: false,
      error: 'Password must include an uppercase letter, a lowercase letter and a number',
    };
  }
  if (password === DEFAULT_CONSUMER_PASSWORD) {
    return { ok: false, error: 'You cannot use the temporary default password. Please choose your own password.' };
  }
  return { ok: true };
}

/**
 * True when `newPassword` matches the consumer's current password or any of
 * their last PASSWORD_HISTORY_LIMIT retained hashes.
 */
export async function isPasswordPreviouslyUsed(
  consumerId: string,
  newPassword: string,
): Promise<boolean> {
  const consumer = await prisma.consumerAccount.findUnique({
    where: { id: consumerId },
    select: { password: true },
  });

  const history = await prisma.consumerPasswordHistory.findMany({
    where: { consumerId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_LIMIT,
    select: { passwordHash: true },
  });

  const hashes = [
    ...(consumer?.password ? [consumer.password] : []),
    ...history.map((h) => h.passwordHash),
  ];

  for (const hash of hashes) {
    if (await bcrypt.compare(newPassword, hash)) return true;
  }
  return false;
}

export interface SetPasswordOptions {
  /** Mark the account as requiring another change on next login (default false). */
  mustChangePassword?: boolean;
  /** Skip the reuse check — only for issuing the shared default password. */
  skipReuseCheck?: boolean;
  /** Skip strength validation — only for issuing the shared default password. */
  skipStrengthCheck?: boolean;
}

export interface SetPasswordResult {
  ok: boolean;
  error?: string;
}

/**
 * Canonical way to set a Credo consumer password. Validates strength, blocks
 * reuse of the last PASSWORD_HISTORY_LIMIT passwords, archives the outgoing
 * hash into history (trimmed to the limit), activates the account, and resets
 * the lockout counters.
 */
export async function setConsumerPassword(
  consumerId: string,
  newPassword: string,
  options: SetPasswordOptions = {},
): Promise<SetPasswordResult> {
  if (!options.skipStrengthCheck) {
    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) return { ok: false, error: strength.error };
  }

  if (!options.skipReuseCheck && (await isPasswordPreviouslyUsed(consumerId, newPassword))) {
    return {
      ok: false,
      error: `You cannot reuse any of your last ${PASSWORD_HISTORY_LIMIT} passwords. Please choose a new one.`,
    };
  }

  const consumer = await prisma.consumerAccount.findUnique({
    where: { id: consumerId },
    select: { id: true, password: true, activatedAt: true },
  });
  if (!consumer) return { ok: false, error: 'Account not found' };

  const hashed = await bcrypt.hash(newPassword, BCRYPT_COST);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Archive the outgoing password so it counts towards the reuse window.
    if (consumer.password) {
      await tx.consumerPasswordHistory.create({
        data: { consumerId, passwordHash: consumer.password },
      });
      const stale = await tx.consumerPasswordHistory.findMany({
        where: { consumerId },
        orderBy: { createdAt: 'desc' },
        skip: PASSWORD_HISTORY_LIMIT,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.consumerPasswordHistory.deleteMany({
          where: { id: { in: stale.map((s) => s.id) } },
        });
      }
    }

    await tx.consumerAccount.update({
      where: { id: consumerId },
      data: {
        password: hashed,
        passwordChangedAt: now,
        mustChangePassword: options.mustChangePassword ?? false,
        activatedAt: consumer.activatedAt ?? now,
        isVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  });

  logger.info(`Password updated for consumer ${consumerId} (mustChangePassword=${options.mustChangePassword ?? false})`);
  return { ok: true };
}

/**
 * Record a failed login and lock the account after MAX_FAILED_LOGIN_ATTEMPTS.
 * Returns whether the account is now locked.
 */
export async function recordFailedLogin(consumerId: string): Promise<{ locked: boolean }> {
  const updated = await prisma.consumerAccount.update({
    where: { id: consumerId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    await prisma.consumerAccount.update({
      where: { id: consumerId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) },
    });
    logger.warn(`Consumer ${consumerId} locked out after ${updated.failedLoginAttempts} failed logins`);
    return { locked: true };
  }
  return { locked: false };
}

/** Clear lockout state after a successful login. */
export async function recordSuccessfulLogin(consumerId: string): Promise<void> {
  await prisma.consumerAccount.update({
    where: { id: consumerId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

/** True while the account is inside an active lockout window. */
export function isAccountLocked(consumer: { lockedUntil: Date | null }): boolean {
  return !!consumer.lockedUntil && consumer.lockedUntil.getTime() > Date.now();
}
