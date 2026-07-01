import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
const upsertMock = vi.fn();
const staffBankingFindUniqueMock = vi.fn();
const bankAccountFindFirstMock = vi.fn();

vi.mock('@zenowethu/database', () => ({
  Prisma: {},
  prisma: {
    staffBankingDetail: { findUnique: (...a: unknown[]) => staffBankingFindUniqueMock(...a) },
    bankAccount: { findFirst: (...a: unknown[]) => bankAccountFindFirstMock(...a) },
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        documentSequence: { upsert: (...a: unknown[]) => upsertMock(...a) },
        invoice: {
          create: (...a: unknown[]) => createMock(...a),
          findFirst: async () => null,
          findMany: async () => [],
        },
      }),
  },
}));

import { createR350AdminFeeInvoice, R350_ADMIN_FEE_AMOUNT } from './r350-admin-fee-invoice';

describe('createR350AdminFeeInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ prefix: 'INV', year: new Date().getFullYear(), nextSeq: 2 });
    createMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'inv-1', ...data }));
  });

  it('uses the case creator\'s own banking when they have one on file', async () => {
    staffBankingFindUniqueMock.mockResolvedValue({ bankName: 'FNB' });

    await createR350AdminFeeInvoice({
      caseId: 'case-1', clientId: 'client-1', reference: '8001015009087', createdById: 'user-1',
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.personalBankingUserId).toBe('user-1');
    expect(data.bankAccountId).toBeNull();
    expect(bankAccountFindFirstMock).not.toHaveBeenCalled();
  });

  it('falls back to the org default bank account when the creator has no personal banking', async () => {
    staffBankingFindUniqueMock.mockResolvedValue(null);
    bankAccountFindFirstMock.mockResolvedValue({ id: 'bank-fnb' });

    await createR350AdminFeeInvoice({
      caseId: 'case-1', clientId: 'client-1', reference: '8001015009087', createdById: 'user-1',
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.bankAccountId).toBe('bank-fnb');
    expect(data.personalBankingUserId).toBeNull();
  });

  it('creates a flat R350 line item, no VAT, with the consumer ID number as reference', async () => {
    staffBankingFindUniqueMock.mockResolvedValue(null);
    bankAccountFindFirstMock.mockResolvedValue({ id: 'bank-fnb' });

    await createR350AdminFeeInvoice({
      caseId: 'case-1', clientId: 'client-1', reference: '8001015009087', createdById: 'user-1',
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.type).toBe('INVOICE');
    expect(data.status).toBe('DRAFT');
    expect(data.reference).toBe('8001015009087');
    expect(Number(data.subtotal)).toBe(R350_ADMIN_FEE_AMOUNT);
    expect(Number(data.vatAmount)).toBe(0);
    expect(Number(data.total)).toBe(R350_ADMIN_FEE_AMOUNT);
    expect(data.lineItems).toEqual([
      { description: 'R350 Admin Fee (Debt Review Administration Levy)', quantity: 1, unitPrice: R350_ADMIN_FEE_AMOUNT },
    ]);
    expect(data.caseId).toBe('case-1');
    expect(data.clientId).toBe('client-1');
    expect(data.createdById).toBe('user-1');
  });
});
