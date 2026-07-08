import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const prismaMock = vi.hoisted(() => {
  const mock: any = {
    consumerAccount: { findUnique: vi.fn(), update: vi.fn() },
    consumerPasswordHistory: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  // Support both the array form and the interactive callback form.
  mock.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(mock) : Promise.all(arg as Promise<unknown>[]),
  );
  return mock;
});

vi.mock('@zenowethu/database', () => ({ prisma: prismaMock }));
vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  DEFAULT_CONSUMER_PASSWORD,
  PASSWORD_HISTORY_LIMIT,
  MAX_FAILED_LOGIN_ATTEMPTS,
  validatePasswordStrength,
  isPasswordPreviouslyUsed,
  setConsumerPassword,
  recordFailedLogin,
  isAccountLocked,
  getDefaultPasswordHash,
} from './password-policy';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.consumerPasswordHistory.findMany.mockResolvedValue([]);
  prismaMock.consumerAccount.update.mockResolvedValue({});
});

describe('validatePasswordStrength', () => {
  it('accepts a compliant password', () => {
    expect(validatePasswordStrength('MyStrong1Pass').ok).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePasswordStrength('Ab1').ok).toBe(false);
  });

  it('rejects passwords missing uppercase, lowercase or a digit', () => {
    expect(validatePasswordStrength('alllowercase1').ok).toBe(false);
    expect(validatePasswordStrength('ALLUPPERCASE1').ok).toBe(false);
    expect(validatePasswordStrength('NoDigitsHere').ok).toBe(false);
  });

  it('rejects the shared default password', () => {
    const r = validatePasswordStrength(DEFAULT_CONSUMER_PASSWORD);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/default password/i);
  });
});

describe('getDefaultPasswordHash', () => {
  it('produces a bcrypt hash matching the default password and caches it', async () => {
    const h1 = await getDefaultPasswordHash();
    const h2 = await getDefaultPasswordHash();
    expect(h1).toBe(h2);
    expect(await bcrypt.compare(DEFAULT_CONSUMER_PASSWORD, h1)).toBe(true);
  });
});

describe('isPasswordPreviouslyUsed', () => {
  it('detects a match against the current password', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue({
      password: await bcrypt.hash('CurrentPass1', 4),
    });
    expect(await isPasswordPreviouslyUsed('c1', 'CurrentPass1')).toBe(true);
  });

  it('detects a match against a historical hash', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue({ password: await bcrypt.hash('CurrentPass1', 4) });
    prismaMock.consumerPasswordHistory.findMany.mockResolvedValue([
      { passwordHash: await bcrypt.hash('OldPass111', 4) },
    ]);
    expect(await isPasswordPreviouslyUsed('c1', 'OldPass111')).toBe(true);
  });

  it('returns false for a brand-new password', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue({ password: await bcrypt.hash('CurrentPass1', 4) });
    expect(await isPasswordPreviouslyUsed('c1', 'FreshPass99')).toBe(false);
  });

  it('queries only the last PASSWORD_HISTORY_LIMIT entries', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue({ password: null });
    await isPasswordPreviouslyUsed('c1', 'FreshPass99');
    expect(prismaMock.consumerPasswordHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: PASSWORD_HISTORY_LIMIT }),
    );
  });
});

describe('setConsumerPassword', () => {
  it('rejects a weak password before touching the database', async () => {
    const r = await setConsumerPassword('c1', 'weak');
    expect(r.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of a recent password', async () => {
    const currentHash = await bcrypt.hash('SamePass11', 4);
    prismaMock.consumerAccount.findUnique.mockResolvedValue({ id: 'c1', password: currentHash, activatedAt: new Date() });
    const r = await setConsumerPassword('c1', 'SamePass11');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/last 5 passwords/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('archives the old hash, stores a new bcrypt hash and clears lockout + mustChangePassword', async () => {
    const oldHash = await bcrypt.hash('OldPass111', 4);
    prismaMock.consumerAccount.findUnique.mockResolvedValue({ id: 'c1', password: oldHash, activatedAt: null });

    const r = await setConsumerPassword('c1', 'BrandNew99');
    expect(r.ok).toBe(true);

    expect(prismaMock.consumerPasswordHistory.create).toHaveBeenCalledWith({
      data: { consumerId: 'c1', passwordHash: oldHash },
    });

    const update = prismaMock.consumerAccount.update.mock.calls.at(-1)[0];
    expect(update.data.password).not.toBe('BrandNew99');
    expect(await bcrypt.compare('BrandNew99', update.data.password)).toBe(true);
    expect(update.data.mustChangePassword).toBe(false);
    expect(update.data.failedLoginAttempts).toBe(0);
    expect(update.data.lockedUntil).toBeNull();
    expect(update.data.activatedAt instanceof Date).toBe(true);
  });

  it('returns an error for a missing account', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue(null);
    const r = await setConsumerPassword('ghost', 'BrandNew99');
    expect(r).toEqual({ ok: false, error: 'Account not found' });
  });
});

describe('lockout', () => {
  it('locks the account once MAX_FAILED_LOGIN_ATTEMPTS is reached', async () => {
    prismaMock.consumerAccount.update.mockResolvedValueOnce({ failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS });
    const r = await recordFailedLogin('c1');
    expect(r.locked).toBe(true);
    const lockCall = prismaMock.consumerAccount.update.mock.calls.at(-1)[0];
    expect(lockCall.data.lockedUntil instanceof Date).toBe(true);
  });

  it('does not lock below the threshold', async () => {
    prismaMock.consumerAccount.update.mockResolvedValueOnce({ failedLoginAttempts: 1 });
    const r = await recordFailedLogin('c1');
    expect(r.locked).toBe(false);
  });

  it('isAccountLocked respects the lockout window', () => {
    expect(isAccountLocked({ lockedUntil: new Date(Date.now() + 60_000) })).toBe(true);
    expect(isAccountLocked({ lockedUntil: new Date(Date.now() - 60_000) })).toBe(false);
    expect(isAccountLocked({ lockedUntil: null })).toBe(false);
  });
});
