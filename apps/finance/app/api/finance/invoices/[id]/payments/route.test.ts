import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const tx = {
    payment: { create: vi.fn(), aggregate: vi.fn() },
    invoice: { update: vi.fn() },
};

vi.mock('@zenowethu/database', () => ({
    prisma: {
        invoice: { findUnique: vi.fn() },
        payment: { findMany: vi.fn() },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST } from './route';

const session = { user: { id: 'u1', isAdmin: true } };
const params = Promise.resolve({ id: 'inv-1' });

const invoice = {
    id: 'inv-1',
    type: 'INVOICE',
    status: 'SENT',
    total: 1000,
    clientId: 'client-1',
    caseId: 'case-1',
};

function makePost(body: unknown) {
    return new Request('http://localhost/api/finance/invoices/inv-1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/finance/invoices/[id]/payments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth as any).mockResolvedValue(null);
        const res = await POST(makePost({ amount: 100, method: 'EFT' }), { params });
        expect(res.status).toBe(401);
    });

    it('rejects a non-positive amount', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        const res = await POST(makePost({ amount: -5, method: 'EFT' }), { params });
        expect(res.status).toBe(422);
    });

    it('refuses payments against a quotation', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...invoice, type: 'QUOTE' } as any);
        const res = await POST(makePost({ amount: 100, method: 'EFT' }), { params });
        expect(res.status).toBe(409);
    });

    it('records a partial payment and sets PARTIALLY_PAID', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        tx.payment.create.mockImplementation(async (args: any) => ({ id: 'pay-1', ...args.data }));
        tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 400 } } as any);
        tx.invoice.update.mockImplementation(async (args: any) => ({ ...invoice, ...args.data }));

        const res = await POST(makePost({ amount: 400, method: 'EFT', reference: 'ABC123' }), { params });
        expect(res.status).toBe(201);
        const body = await res.json();

        expect(body.invoice.status).toBe('PARTIALLY_PAID');
        expect(body.amountPaid).toBe(400);
        expect(body.balanceDue).toBe(600);

        const paymentArgs = tx.payment.create.mock.calls[0][0] as any;
        expect(paymentArgs.data.invoiceId).toBe('inv-1');
        expect(paymentArgs.data.clientId).toBe('client-1');
        expect(paymentArgs.data.recordedById).toBe('u1');
        expect(paymentArgs.data.category).toBe('INVOICE_PAYMENT');
    });

    it('sets PAID when payments cover the total', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        tx.payment.create.mockResolvedValue({ id: 'pay-2' } as any);
        tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 1000 } } as any);
        tx.invoice.update.mockImplementation(async (args: any) => ({ ...invoice, ...args.data }));

        const res = await POST(makePost({ amount: 600, method: 'CASH' }), { params });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.invoice.status).toBe('PAID');
        expect(body.balanceDue).toBe(0);
        expect(body.overpaidBy).toBe(0);
    });

    it('still settles as PAID when the client overpays and reports the overpaid amount', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        tx.payment.create.mockResolvedValue({ id: 'pay-3' } as any);
        tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 1200 } } as any);
        tx.invoice.update.mockImplementation(async (args: any) => ({ ...invoice, ...args.data }));

        const res = await POST(makePost({ amount: 1200, method: 'EFT' }), { params });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.invoice.status).toBe('PAID');
        expect(body.balanceDue).toBe(0);
        expect(body.overpaidBy).toBe(200);
    });
});

describe('GET /api/finance/invoices/[id]/payments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns payments with running totals', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([
            { id: 'p1', amount: 250, date: new Date(), method: 'EFT', recordedBy: null },
            { id: 'p2', amount: 150, date: new Date(), method: 'CASH', recordedBy: null },
        ] as any);

        const res = await GET(new Request('http://localhost'), { params });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.amountPaid).toBe(400);
        expect(body.balanceDue).toBe(600);
        expect(body.payments).toHaveLength(2);
    });
});
