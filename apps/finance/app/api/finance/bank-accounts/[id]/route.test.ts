import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH, DELETE } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    bankAccount: { update: vi.fn().mockResolvedValue({ id: 'bank-1' }) },
    $transaction: async (cb: (tx: unknown) => unknown) => cb({
      bankAccount: { updateMany: vi.fn(), update: vi.fn().mockResolvedValue({ id: 'bank-1' }) },
    }),
  },
}));

vi.mock('@zenowethu/shared-lib', () => ({ auth: vi.fn() }));

import { auth } from '@zenowethu/shared-lib';

const mockAuth = vi.mocked(auth);

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/finance/bank-accounts/bank-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'bank-1' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/finance/bank-accounts/[id]', () => {
  it('rejects a non-admin staff member with 403', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', isAdmin: false } } as never);
    const res = await PATCH(makePatchRequest({ isDefault: true }), { params });
    expect(res.status).toBe(403);
  });

  it('allows Admin to update a bank account', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'admin-1', isAdmin: true } } as never);
    const res = await PATCH(makePatchRequest({ isDefault: true }), { params });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/finance/bank-accounts/[id]', () => {
  it('rejects a non-admin staff member with 403', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', isAdmin: false } } as never);
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params });
    expect(res.status).toBe(403);
  });

  it('allows Admin to archive (soft-delete) a bank account', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'admin-1', isAdmin: true } } as never);
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params });
    expect(res.status).toBe(204);
  });
});
