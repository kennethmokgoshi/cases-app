import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the data passed to invoice.create and feed allocateDocumentNumber.
const createMock = vi.fn();
const upsertMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('@zenowethu/database', () => ({
  Prisma: {},
  prisma: {
    bankAccount: { findFirst: (...a: unknown[]) => findFirstMock(...a) },
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

import { createDcFeeInvoice } from './dc-fee-invoice-service';

const baseInput = {
  dcName: 'Jane Counsellor',
  dcEmail: 'jane@dc.co.za',
  dcTradingName: 'Jane DC Services',
  clientFirstName: 'John',
  clientLastName: 'Dlamini',
  clientIdNumber: '8001015009087',
  applyVat: true,
  notes: 'Settle before transfer.',
  lineItems: [
    { reasonKey: 'COMMISSION_PAID_OUT' as const, description: 'Commission paid out', amount: 1000 },
    { reasonKey: 'ADMIN_FEES' as const, description: 'Admin fees', amount: 500 },
  ],
};

describe('createDcFeeInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockResolvedValue({ id: 'bank-1' });
    upsertMock.mockResolvedValue({ prefix: 'INV', year: new Date().getFullYear(), nextSeq: 2 });
    createMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'inv-1',
      ...data,
    }));
  });

  it('persists a DC_FEE_INVOICE with mapped fee lines, VAT totals, DC fields and consumer reference', async () => {
    await createDcFeeInvoice({
      input: baseInput,
      caseId: 'case-1',
      clientId: 'client-1',
      createdById: 'user-1',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;

    expect(data.type).toBe('DC_FEE_INVOICE');
    expect(data.status).toBe('DRAFT');
    expect(data.invoiceNumber).toBe(`INV-${new Date().getFullYear()}-0002`);

    // Totals (subtotal 1500 + 15% VAT)
    expect(Number(data.subtotal)).toBe(1500);
    expect(Number(data.vatAmount)).toBe(225);
    expect(Number(data.total)).toBe(1725);

    // DC bill-to + consumer reference
    expect(data.dcName).toBe('Jane Counsellor');
    expect(data.dcEmail).toBe('jane@dc.co.za');
    expect(data.dcTradingName).toBe('Jane DC Services');
    expect(data.reference).toBe('Outstanding fees re: John Dlamini (ID: 8001015009087)');

    // Line items mapped to qty/unitPrice shape
    expect(data.lineItems).toHaveLength(2);
    expect(data.lineItems[0]).toMatchObject({ description: 'Commission paid out', quantity: 1, unitPrice: 1000 });

    // Links + bank
    expect(data.caseId).toBe('case-1');
    expect(data.clientId).toBe('client-1');
    expect(data.bankAccountId).toBe('bank-1');
    expect(data.createdById).toBe('user-1');
  });

  it('issues a QUOTATION with a QUO- number and DC_FEE_QUOTE type', async () => {
    upsertMock.mockResolvedValue({ prefix: 'QUO', year: new Date().getFullYear(), nextSeq: 2 });
    await createDcFeeInvoice({
      input: { ...baseInput, documentType: 'QUOTE' },
      createdById: 'user-1',
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.type).toBe('DC_FEE_QUOTE');
    expect(data.invoiceNumber).toBe(`QUO-${new Date().getFullYear()}-0002`);
  });

  it('omits VAT when applyVat is false and links nothing for a standalone invoice', async () => {
    findFirstMock.mockResolvedValue(null);
    await createDcFeeInvoice({
      input: { ...baseInput, applyVat: false },
      createdById: 'user-1',
    });

    const data = createMock.mock.calls[0][0].data;
    expect(Number(data.vatAmount)).toBe(0);
    expect(Number(data.total)).toBe(1500);
    expect(data.caseId).toBeNull();
    expect(data.clientId).toBeNull();
    expect(data.bankAccountId).toBeNull();
  });
});
