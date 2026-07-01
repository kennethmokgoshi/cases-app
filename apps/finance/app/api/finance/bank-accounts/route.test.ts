import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    bankAccount: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: async (cb: (tx: unknown) => unknown) => cb({
      bankAccount: { updateMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'bank-new' }) },
    }),
  },
}));

vi.mock('@zenowethu/shared-lib', () => ({ auth: vi.fn() }));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.bankAccount.findMany);

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/finance/bank-accounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const validBody = { bankName: 'FNB', accountName: 'Zenowethu', accountNumber: '62867268635', branchCode: '250655' };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

describe('GET /api/finance/bank-accounts', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('allows any authenticated staff member to list accounts (feeds invoice dropdown)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', isAdmin: false } } as never);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('POST /api/finance/bank-accounts', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin staff member with 403', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', isAdmin: false } } as never);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('allows Admin to create a bank account', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'admin-1', isAdmin: true } } as never);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
  });
});
