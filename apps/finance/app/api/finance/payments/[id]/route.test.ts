import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    workflowLog: { create: vi.fn() },
  },
}));

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.payment.findUnique);
const mockUpdate = vi.mocked(prisma.payment.update);
const mockLogCreate = vi.mocked(prisma.workflowLog.create);

const existingPayment = {
  id: 'pay-1', amount: 100, date: new Date('2026-06-01'), method: 'EFT',
  reference: 'OLD-REF', notes: null, category: 'INSTALLMENT', status: 'COMPLETED',
  clientId: 'client-1', caseId: null, batchId: null,
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/finance/payments/pay-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'pay-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never);
  mockFindUnique.mockResolvedValue(existingPayment as never);
  mockUpdate.mockResolvedValue({ ...existingPayment, amount: 250 } as never);
});

describe('PATCH /api/finance/payments/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await PATCH(makeRequest({ amount: 250 }), params);
    expect(res.status).toBe(401);
  });

  it('returns 404 when payment does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null as never);
    const res = await PATCH(makeRequest({ amount: 250 }), params);
    expect(res.status).toBe(404);
  });

  it('updates only the provided fields', async () => {
    const res = await PATCH(makeRequest({ amount: '250.00', reference: 'NEW-REF' }), params);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pay-1' },
      data: { amount: 250, reference: 'NEW-REF' },
    }));
  });

  it('rejects a non-positive amount with 400', async () => {
    const res = await PATCH(makeRequest({ amount: -5 }), params);
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty body with 400', async () => {
    const res = await PATCH(makeRequest({}), params);
    expect(res.status).toBe(400);
  });

  it('clears reference/notes when explicitly set to empty', async () => {
    const res = await PATCH(makeRequest({ reference: '', notes: '' }), params);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { reference: null, notes: null },
    }));
  });

  it('writes a workflow audit log when the payment is case-linked', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...existingPayment, caseId: 'case-1' } as never);
    const res = await PATCH(makeRequest({ amount: 250 }), params);
    expect(res.status).toBe(200);
    expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ caseId: 'case-1', action: 'PAYMENT_EDITED', userId: 'user-1' }),
    }));
  });

  it('skips the audit log for payments without a case', async () => {
    const res = await PATCH(makeRequest({ amount: 250 }), params);
    expect(res.status).toBe(200);
    expect(mockLogCreate).not.toHaveBeenCalled();
  });

  it('accepts multipart with a replacement proof of payment', async () => {
    const form = new FormData();
    form.set('proofOfPayment', new File(['proof-bytes'], 'pop.png', { type: 'image/png' }));
    const req = new Request('http://localhost/api/finance/payments/pay-1', { method: 'PATCH', body: form });
    const res = await PATCH(req, params);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { proofOfPaymentUrl: expect.stringMatching(/^\/uploads\/payments\/pay-1\/\d+-pop\.png$/) },
    }));
  });

  it('rejects a disallowed proof file type with 400', async () => {
    const form = new FormData();
    form.set('proofOfPayment', new File(['x'], 'evil.exe', { type: 'application/x-msdownload' }));
    const req = new Request('http://localhost/api/finance/payments/pay-1', { method: 'PATCH', body: form });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
