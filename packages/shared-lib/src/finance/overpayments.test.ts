import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        invoice: { findFirst: vi.fn(), findMany: vi.fn() },
        payment: { aggregate: vi.fn(), groupBy: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCaseQuoteCapture, getOverpaymentSummary } from './overpayments';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getCaseQuoteCapture', () => {
    it('returns null when the case has no accepted quote', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
        const result = await getCaseQuoteCapture('case-1');
        expect(result).toBeNull();
        expect(prisma.payment.aggregate).not.toHaveBeenCalled();
    });

    it('reports an unsettled quote with no overpayment', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0058', total: 5000, convertedToInvoice: null,
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 3000 } } as any);

        const result = await getCaseQuoteCapture('case-1');

        expect(result).toEqual({
            quoteId: 'q1', quoteNumber: 'QUO-2026-0058',
            quoteTotal: 5000, captured: 3000, settled: false, overpaidBy: 0,
        });
    });

    it('stays settled and reports the overpaid amount when captured exceeds the quote', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0058', total: 5000, convertedToInvoice: null,
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 6250.5 } } as any);

        const result = await getCaseQuoteCapture('case-1');

        expect(result).toMatchObject({ settled: true, captured: 6250.5, overpaidBy: 1250.5 });
    });

    it('counts a converted invoice marked PAID without payment rows as captured', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0058', total: 5000,
            convertedToInvoice: { status: 'PAID', total: 5000 },
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);

        const result = await getCaseQuoteCapture('case-1');

        expect(result).toMatchObject({ settled: true, captured: 5000, overpaidBy: 0 });
    });

    it('never settles against a zero-total quote', async () => {
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: 'q1', invoiceNumber: 'QUO-2026-0058', total: 0, convertedToInvoice: null,
        } as any);
        vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 100 } } as any);

        const result = await getCaseQuoteCapture('case-1');

        expect(result).toMatchObject({ settled: false, overpaidBy: 0 });
    });
});

describe('getOverpaymentSummary', () => {
    function mockDb({
        quotes = [],
        caseSums = [],
        invoiceSums = [],
        invoices = [],
    }: {
        quotes?: unknown[];
        caseSums?: unknown[];
        invoiceSums?: unknown[];
        invoices?: unknown[];
    }) {
        const invoiceFindMany = prisma.invoice.findMany as unknown as Mock;
        const paymentGroupBy = prisma.payment.groupBy as unknown as Mock;

        invoiceFindMany.mockImplementation(async (args: any) =>
            (args.where.type === 'QUOTE' ? quotes : invoices) as any);
        paymentGroupBy.mockImplementation(async (args: any) =>
            (args.by[0] === 'caseId' ? caseSums : invoiceSums) as any);
    }

    it('returns an empty summary when nothing is overpaid', async () => {
        mockDb({
            quotes: [{
                id: 'q1', invoiceNumber: 'QUO-2026-0001', total: 5000, caseId: 'case-1',
                client: { firstName: 'Nofda', lastName: 'Moeng' },
                case: { fileNumber: 'ZDM-2026-1020-43Z' }, convertedToInvoice: null,
            }],
            caseSums: [{ caseId: 'case-1', _sum: { amount: 5000 } }],
        });

        const result = await getOverpaymentSummary();

        expect(result).toEqual({ count: 0, totalOverpaid: 0, items: [] });
    });

    it('reports a case whose payments exceed its accepted quote', async () => {
        mockDb({
            quotes: [{
                id: 'q1', invoiceNumber: 'QUO-2026-0058', total: 5000, caseId: 'case-1',
                client: { firstName: 'Nofda', lastName: 'Moeng' },
                case: { fileNumber: 'ZDM-2026-1020-43Z' }, convertedToInvoice: null,
            }],
            caseSums: [{ caseId: 'case-1', _sum: { amount: 5750 } }],
        });

        const result = await getOverpaymentSummary();

        expect(result.count).toBe(1);
        expect(result.totalOverpaid).toBe(750);
        expect(result.items[0]).toEqual({
            kind: 'QUOTE',
            invoiceId: 'q1',
            number: 'QUO-2026-0058',
            clientName: 'Nofda Moeng',
            caseId: 'case-1',
            caseFileNumber: 'ZDM-2026-1020-43Z',
            expected: 5000,
            captured: 5750,
            overpaidBy: 750,
        });
    });

    it('measures against the latest accepted quote when a case has several', async () => {
        // Rows are ordered acceptedAt desc — the R6000 quote is the newest
        mockDb({
            quotes: [
                {
                    id: 'q-new', invoiceNumber: 'QUO-2026-0060', total: 6000, caseId: 'case-1',
                    client: null, case: null, convertedToInvoice: null,
                },
                {
                    id: 'q-old', invoiceNumber: 'QUO-2026-0058', total: 5000, caseId: 'case-1',
                    client: null, case: null, convertedToInvoice: null,
                },
            ],
            caseSums: [{ caseId: 'case-1', _sum: { amount: 6100 } }],
        });

        const result = await getOverpaymentSummary();

        expect(result.count).toBe(1);
        expect(result.items[0]).toMatchObject({ invoiceId: 'q-new', expected: 6000, overpaidBy: 100 });
    });

    it('includes standalone overpaid invoices but never double-counts a quoted case', async () => {
        mockDb({
            quotes: [{
                id: 'q1', invoiceNumber: 'QUO-2026-0058', total: 5000, caseId: 'case-1',
                client: null, case: null, convertedToInvoice: null,
            }],
            caseSums: [{ caseId: 'case-1', _sum: { amount: 5200 } }],
            invoiceSums: [
                { invoiceId: 'inv-quoted', _sum: { amount: 5200 } },
                { invoiceId: 'inv-standalone', _sum: { amount: 1500 } },
            ],
            invoices: [
                // Belongs to case-1 which is already measured by its quote — skipped
                {
                    id: 'inv-quoted', invoiceNumber: 'INV-2026-0009', total: 5000, caseId: 'case-1',
                    client: null, case: null,
                },
                // No case — measured against its own total
                {
                    id: 'inv-standalone', invoiceNumber: 'INV-2026-0010', total: 1000, caseId: null,
                    client: { firstName: 'Thabo', lastName: 'Nkosi' }, case: null,
                },
            ],
        });

        const result = await getOverpaymentSummary();

        expect(result.count).toBe(2);
        expect(result.totalOverpaid).toBe(700);
        expect(result.items.map(i => i.invoiceId).sort()).toEqual(['inv-standalone', 'q1']);
        const standalone = result.items.find(i => i.invoiceId === 'inv-standalone');
        expect(standalone).toMatchObject({ kind: 'INVOICE', clientName: 'Thabo Nkosi', overpaidBy: 500 });
    });

    it('sorts by overpaid amount and truncates items to the limit while keeping full totals', async () => {
        mockDb({
            quotes: [
                { id: 'q1', invoiceNumber: 'QUO-1', total: 100, caseId: 'c1', client: null, case: null, convertedToInvoice: null },
                { id: 'q2', invoiceNumber: 'QUO-2', total: 100, caseId: 'c2', client: null, case: null, convertedToInvoice: null },
                { id: 'q3', invoiceNumber: 'QUO-3', total: 100, caseId: 'c3', client: null, case: null, convertedToInvoice: null },
            ],
            caseSums: [
                { caseId: 'c1', _sum: { amount: 150 } },
                { caseId: 'c2', _sum: { amount: 400 } },
                { caseId: 'c3', _sum: { amount: 200 } },
            ],
        });

        const result = await getOverpaymentSummary({ limit: 2 });

        expect(result.count).toBe(3);
        expect(result.totalOverpaid).toBe(450);
        expect(result.items.map(i => i.invoiceId)).toEqual(['q2', 'q3']);
    });
});
