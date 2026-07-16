import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  consumerAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  passwordResetToken: { create: vi.fn() },
}));

vi.mock('@zenowethu/database', () => ({ prisma: prismaMock }));
vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../notifications/templates', () => ({ renderBrandedEmail: () => '<html></html>' }));
vi.mock('../notifications/service', () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({ emailSuccess: true, errors: [] }),
}));

import {
  hashResetToken,
  provisionConsumerForClient,
  createPasswordResetTokenForConsumer,
} from './consumer-provisioning';

const VALID_ID = '8001015009087';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'tok1' });
});

describe('hashResetToken', () => {
  it('is deterministic and hex (sha256 → 64 chars)', () => {
    const a = hashResetToken('abc');
    expect(a).toBe(hashResetToken('abc'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different inputs', () => {
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });
});

describe('provisionConsumerForClient', () => {
  it('returns null when the client has no valid 13-digit ID number', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: 'c1', firstName: 'A', lastName: 'B', email: null, phone: null, idNumber: null,
    });
    const result = await provisionConsumerForClient('c1');
    expect(result).toBeNull();
    expect(prismaMock.consumerAccount.create).not.toHaveBeenCalled();
  });

  it('returns existing (created:false) when an account is already linked', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: 'c1', firstName: 'A', lastName: 'B', email: 'x@y.z', phone: null, idNumber: VALID_ID,
    });
    prismaMock.consumerAccount.findUnique.mockResolvedValueOnce({ id: 'existing' }); // by linkedClientId
    const result = await provisionConsumerForClient('c1');
    expect(result).toEqual({ consumerId: 'existing', created: false, activationToken: null });
    expect(prismaMock.consumerAccount.create).not.toHaveBeenCalled();
  });

  it('links an existing-by-ID account that was not yet linked', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: 'c1', firstName: 'A', lastName: 'B', email: 'x@y.z', phone: null, idNumber: VALID_ID,
    });
    prismaMock.consumerAccount.findUnique
      .mockResolvedValueOnce(null) // by linkedClientId
      .mockResolvedValueOnce({ id: 'byId', linkedClientId: null }); // by idNumber
    const result = await provisionConsumerForClient('c1');
    expect(prismaMock.consumerAccount.update).toHaveBeenCalledWith({
      where: { id: 'byId' }, data: { linkedClientId: 'c1' },
    });
    expect(result).toEqual({ consumerId: 'byId', created: false, activationToken: null });
  });

  it('creates a new profile with the default password (hashed, optional change) and an activation token', async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: 'c1', firstName: 'Sipho', lastName: 'M', email: 'sipho@x.co.za', phone: '0820000000', idNumber: VALID_ID,
    });
    prismaMock.consumerAccount.findUnique
      .mockResolvedValueOnce(null) // by linkedClientId
      .mockResolvedValueOnce(null); // by idNumber
    prismaMock.consumerAccount.create.mockResolvedValue({ id: 'new1' });

    const result = await provisionConsumerForClient('c1');

    expect(prismaMock.consumerAccount.create).toHaveBeenCalledOnce();
    const createArg = prismaMock.consumerAccount.create.mock.calls[0][0];
    // Default password is stored as a bcrypt hash, never plaintext, and the
    // consumer may change it later (not forced on first login).
    expect(typeof createArg.data.password).toBe('string');
    expect(createArg.data.password).not.toBe('Consumer@1');
    expect(createArg.data.password.startsWith('$2')).toBe(true);
    expect(createArg.data.mustChangePassword).toBe(false);
    expect(createArg.data.source).toBe('AUTO_PROVISIONED');
    expect(createArg.data.idNumber).toBe(VALID_ID);
    expect(result?.created).toBe(true);
    expect(typeof result?.activationToken).toBe('string');
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledOnce();
  });

  it('returns null when the client does not exist', async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    expect(await provisionConsumerForClient('missing')).toBeNull();
  });
});

describe('createPasswordResetTokenForConsumer', () => {
  it('stores the hash (not the raw token) and returns the raw token', async () => {
    const raw = await createPasswordResetTokenForConsumer('con1');
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const arg = prismaMock.passwordResetToken.create.mock.calls[0][0];
    expect(arg.data.tokenHash).toBe(hashResetToken(raw));
    expect(arg.data.tokenHash).not.toBe(raw);
    expect(arg.data.expiresAt instanceof Date).toBe(true);
  });
});
