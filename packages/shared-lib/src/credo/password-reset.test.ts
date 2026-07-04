import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  consumerAccount: { findUnique: vi.fn(), update: vi.fn() },
  passwordResetToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}));

const sendTransactionalEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ emailSuccess: true, errors: [] }));

vi.mock('@zenowethu/database', () => ({ prisma: prismaMock }));
vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../notifications/templates', () => ({ renderBrandedEmail: (content: string) => content }));
vi.mock('../notifications/service', () => ({ sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a) }));

import {
  formatConsumerGreetingName,
  requestPasswordReset,
  validateResetToken,
  resetPasswordWithToken,
} from './password-reset';
import { hashResetToken } from './consumer-provisioning';

const VALID_ID = '8001015009087';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'tok1' });
});

describe('formatConsumerGreetingName', () => {
  it('uses the first given name plus surname when the stored firstName has multiple names', () => {
    expect(formatConsumerGreetingName({ firstName: 'NOFDA MMUSHO', lastName: 'MOKGOSHI' })).toBe('NOFDA MOKGOSHI');
  });

  it('falls back to only the first given name when no surname is available', () => {
    expect(formatConsumerGreetingName({ firstName: 'NOFDA MMUSHO', lastName: '' })).toBe('NOFDA');
  });

  it('escapes unsafe characters before rendering the email greeting', () => {
    expect(formatConsumerGreetingName({ firstName: '<Nofda>', lastName: 'M & M' })).toBe('&lt;Nofda&gt; M &amp; M');
  });
});

describe('requestPasswordReset', () => {
  it('returns ok without sending when the ID is not 13 digits', async () => {
    const res = await requestPasswordReset('123');
    expect(res).toEqual({ ok: true, emailSent: false });
    expect(prismaMock.consumerAccount.findUnique).not.toHaveBeenCalled();
  });

  it('returns ok without leaking when no account exists', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue(null);
    const res = await requestPasswordReset(VALID_ID);
    expect(res).toEqual({ ok: true, emailSent: false });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('does not send when the account has only a placeholder email', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue({
      id: 'c1', email: `${VALID_ID}@no-email.zenowethu.co.za`, firstName: 'A',
    });
    const res = await requestPasswordReset(VALID_ID);
    expect(res.emailSent).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('creates a token and emails the reset link for a real account', async () => {
    prismaMock.consumerAccount.findUnique.mockResolvedValue({
      id: 'c1', email: 'real@person.co.za', firstName: 'Sipho Thabo', lastName: 'Dlamini',
    });
    const res = await requestPasswordReset(VALID_ID);
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledOnce();
    expect(sendTransactionalEmail).toHaveBeenCalledOnce();
    expect(sendTransactionalEmail.mock.calls[0]?.[0]).toMatchObject({
      html: expect.stringContaining('Hi Sipho Dlamini,'),
    });
    expect(res.emailSent).toBe(true);
  });
});

describe('validateResetToken', () => {
  it('NOT_FOUND for empty or unknown token', async () => {
    expect((await validateResetToken('')).status).toBe('NOT_FOUND');
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    expect((await validateResetToken('x')).status).toBe('NOT_FOUND');
  });

  it('USED when the token was already consumed', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 't', consumerId: 'c1', expiresAt: new Date(Date.now() + 10000), usedAt: new Date(),
    });
    expect((await validateResetToken('x')).status).toBe('USED');
  });

  it('EXPIRED past the expiry', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 't', consumerId: 'c1', expiresAt: new Date(Date.now() - 1000), usedAt: null,
    });
    expect((await validateResetToken('x')).status).toBe('EXPIRED');
  });

  it('VALID and returns consumerId', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 't', consumerId: 'c1', expiresAt: new Date(Date.now() + 10000), usedAt: null,
    });
    const r = await validateResetToken('x');
    expect(r.status).toBe('VALID');
    expect(r.consumerId).toBe('c1');
  });
});

describe('resetPasswordWithToken', () => {
  it('rejects passwords shorter than 8 characters', async () => {
    const r = await resetPasswordWithToken('tok', 'short');
    expect(r.ok).toBe(false);
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    const r = await resetPasswordWithToken('tok', 'longenough');
    expect(r.ok).toBe(false);
  });

  it('rejects an already-used token', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 't', consumerId: 'c1', expiresAt: new Date(Date.now() + 10000), usedAt: new Date(),
    });
    const r = await resetPasswordWithToken('tok', 'longenough');
    expect(r.ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 't', consumerId: 'c1', expiresAt: new Date(Date.now() - 1000), usedAt: null,
    });
    const r = await resetPasswordWithToken('tok', 'longenough');
    expect(r.ok).toBe(false);
  });

  it('sets the password, activates the account, and consumes the token', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: 't', consumerId: 'c1', expiresAt: new Date(Date.now() + 10000), usedAt: null,
    });
    const r = await resetPasswordWithToken('tok', 'longenough');
    expect(r.ok).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    // Hash stored, not the raw password
    const updateCall = prismaMock.consumerAccount.update.mock.calls[0][0];
    expect(updateCall.data.password).not.toBe('longenough');
    expect(updateCall.data.activatedAt instanceof Date).toBe(true);
  });

  it('looks the token up by its hash, never the raw value', async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    await resetPasswordWithToken('rawtoken', 'longenough');
    const where = prismaMock.passwordResetToken.findUnique.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashResetToken('rawtoken'));
  });
});
