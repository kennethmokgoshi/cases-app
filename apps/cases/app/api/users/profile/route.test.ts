import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    staffBankingDetail: { deleteMany: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('@zenowethu/shared-lib', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(true), hash: vi.fn().mockResolvedValue('hashed') },
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib/src/auth';

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdate = vi.mocked(prisma.user.update);
const mockUpsert = vi.mocked(prisma.staffBankingDetail.upsert);
const mockDeleteMany = vi.mocked(prisma.staffBankingDetail.deleteMany);

function makeGetRequest(): Request {
  return new Request('http://localhost/api/users/profile', { method: 'GET' }) as never;
}

function makePutRequest(body: unknown): Request {
  return new Request('http://localhost/api/users/profile', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never;
}

const session = { user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/users/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await GET(makeGetRequest() as never);
    expect(res.status).toBe(401);
  });

  it('includes staffBankingDetail in the response', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    mockFindUnique.mockResolvedValueOnce({
      id: 'user-1', firstName: 'Jane', lastName: 'Staff',
      staffBankingDetail: { bankName: 'FNB', accountName: 'Jane Staff', accountNumber: '111', branchCode: '250655' },
    } as never);

    const res = await GET(makeGetRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staffBankingDetail).toEqual({ bankName: 'FNB', accountName: 'Jane Staff', accountNumber: '111', branchCode: '250655' });
  });
});

describe('PUT /api/users/profile', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ id: 'user-1', password: 'hash' } as never);
    mockUpdate.mockResolvedValue({ id: 'user-1', firstName: 'Jane' } as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await PUT(makePutRequest({}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 422 for invalid banking details (missing required field)', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    const res = await PUT(makePutRequest({ bankingDetails: { bankName: 'FNB' } }) as never);
    expect(res.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('upserts staffBankingDetail when a complete banking object is submitted', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    const res = await PUT(makePutRequest({
      bankingDetails: { bankName: 'FNB', accountName: 'Jane Staff', accountNumber: '111222333', branchCode: '250655' },
    }) as never);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', bankName: 'FNB', accountName: 'Jane Staff', accountNumber: '111222333', branchCode: '250655' },
      update: { bankName: 'FNB', accountName: 'Jane Staff', accountNumber: '111222333', branchCode: '250655' },
    });
  });

  it('clears staffBankingDetail when bankingDetails is explicitly null', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    const res = await PUT(makePutRequest({ bankingDetails: null }) as never);
    expect(res.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('leaves banking details untouched when the key is omitted', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    const res = await PUT(makePutRequest({ firstName: 'Jane' }) as never);
    expect(res.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('accepts an empty-string newPassword/currentPassword (the account page always sends these) alongside banking details', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    const res = await PUT(makePutRequest({
      firstName: 'Jane',
      newPassword: '',
      currentPassword: '',
      bankingDetails: { bankName: 'Standard Bank', accountName: 'The Director', accountNumber: '10174612727', branchCode: '051001' },
    }) as never);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', bankName: 'Standard Bank', accountName: 'The Director', accountNumber: '10174612727', branchCode: '051001' },
      update: { bankName: 'Standard Bank', accountName: 'The Director', accountNumber: '10174612727', branchCode: '051001' },
    });
  });

  it('still rejects a too-short newPassword when the user actually tries to change it', async () => {
    mockAuth.mockResolvedValueOnce(session as never);
    const res = await PUT(makePutRequest({ currentPassword: 'oldpass', newPassword: 'short' }) as never);
    expect(res.status).toBe(422);
  });
});
