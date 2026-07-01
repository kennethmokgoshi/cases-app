import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    allocateDocumentNumber: async (tx: any, prefix: string, year: number) => {
        const seq = await tx.documentSequence.upsert({
            where: { prefix_year: { prefix, year } },
            update: { nextSeq: { increment: 1 } },
            create: { prefix, year, nextSeq: 2 },
        });
        return `${prefix}-${year}-${String(seq.nextSeq).padStart(4, '0')}`;
    },
}));

const tx = {
    invoice: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    documentSequence: { upsert: vi.fn() },
};

vi.mock('@zenowethu/database', () => ({
    Prisma: {},
    prisma: {
        invoice: { findUnique: vi.fn() },
        bankAccount: { findFirst: vi.fn() },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { POST } from './route';

const adminSession = { user: { id: 'u1', isAdmin: true } };
const staffSession = { user: { id: 'u2', isAdmin: false, role: 'STAFF' } };
const params = Promise.resolve({ id: 'quote-1' });

const acceptedQuote = {
    id: 'quote-1',
    invoiceNumber: 'QUO-2026-0001',
    type: 'QUOTE',
    status: 'ACCEPTED',
    clientId: 'client-1',
    caseId: null,
    projectId: null,
    lineItems: [{ description: 'Debt review removal', quantity: 1, unitPrice: 5000 }],
    subtotal: 5000,
    vatRate: 0.15,
    vatAmount: 750,
    total: 5750,
    notes: null,
    reference: null,
    bankAccountId: 'bank-1',
};

function makeRequest(body?: unknown) {
    return new Request('http://localhost/api/finance/quotes/quote-1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
    });
}

describe('POST /api/finance/quotes/[id]/convert', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth as any).mockResolvedValue(null);
        const res = await POST(makeRequest(), { params });
        expect(res.status).toBe(401);
    });

    it('returns 403 for staff without invoice permissions', async () => {
        vi.mocked(auth as any).mockResolvedValue(staffSession);
        const res = await POST(makeRequest(), { params });
        expect(res.status).toBe(403);
    });

    it('refuses to convert a quote that is not accepted', async () => {
        vi.mocked(auth as any).mockResolvedValue(adminSession);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...acceptedQuote, status: 'SENT' } as any);
        const res = await POST(makeRequest(), { params });
        expect(res.status).toBe(409);
    });

    it('converts an accepted quote into an INV invoice and links both', async () => {
        vi.mocked(auth as any).mockResolvedValue(adminSession);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(acceptedQuote as any);
        tx.documentSequence.upsert.mockResolvedValue({ nextSeq: 8 });
        tx.invoice.create.mockImplementation(async (args: any) => ({ id: 'inv-new', ...args.data }));
        tx.invoice.update.mockResolvedValue({} as any);

        const res = await POST(makeRequest(), { params });
        expect(res.status).toBe(201);
        const body = await res.json();

        const year = new Date().getFullYear();
        expect(body.invoiceNumber).toBe(`INV-${year}-0008`);
        expect(body.type).toBe('INVOICE');
        expect(body.total).toBe(5750);

        const quoteUpdate = tx.invoice.update.mock.calls[0][0] as any;
        expect(quoteUpdate.where.id).toBe('quote-1');
        expect(quoteUpdate.data.status).toBe('CONVERTED');
        expect(quoteUpdate.data.convertedToInvoiceId).toBe('inv-new');
    });

    it('falls back to the default bank account when the quote has none', async () => {
        vi.mocked(auth as any).mockResolvedValue(adminSession);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...acceptedQuote, bankAccountId: null } as any);
        vi.mocked(prisma.bankAccount.findFirst).mockResolvedValue({ id: 'bank-default' } as any);
        tx.documentSequence.upsert.mockResolvedValue({ nextSeq: 2 });
        tx.invoice.create.mockImplementation(async (args: any) => ({ id: 'inv-new', ...args.data }));
        tx.invoice.update.mockResolvedValue({} as any);

        const res = await POST(makeRequest(), { params });
        expect(res.status).toBe(201);
        const createArgs = tx.invoice.create.mock.calls[0][0] as any;
        expect(createArgs.data.bankAccountId).toBe('bank-default');
    });
});
