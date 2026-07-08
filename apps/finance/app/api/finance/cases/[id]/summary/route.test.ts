import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        payment: { findMany: vi.fn() },
        invoice: { findMany: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const session = { user: { id: 'u1', isAdmin: true } };

const caseRecord = {
    id: 'case-1',
    fileNumber: 'ZW-0001',
    status: 'READY_CLEARANCE',
    createdAt: new Date('2026-01-15'),
    acquisitionType: 'B2C',
    partnerName: null,
    partnerBranch: null,
    partnerSplitPercent: 0,
    serviceFeeCollectedBy: 'ZENOWETHU',
    serviceFee: 4500,
    instalments: 3,
    zenowethuShare: null,
    isInvoiced: true,
    r350Status: 'WAIVED',
    totalDebtAmount: 120000,
    totalMonthlyInstallment: 3500,
    clientId: 'client-1',
    client: {
        id: 'client-1',
        firstName: 'Allen',
        lastName: 'Sekwe',
        idNumber: '9204275246089',
        email: 'allensekwe@gmail.com',
        phone: '0820000000',
    },
};

function makeRequest() {
    return new Request('http://localhost/api/finance/cases/case-1/summary');
}

const params = Promise.resolve({ id: 'case-1' });

describe('GET /api/finance/cases/[id]/summary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth as any).mockResolvedValue(null);
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(401);
    });

    it('returns 404 when the case does not exist', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null as any);
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(404);
    });

    it('returns case, client, payments, invoices and a computed summary', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRecord as any);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([
            { id: 'p1', amount: 1500, date: new Date(), method: 'DEBIT_ORDER', reference: 'REF1', category: 'INSTALLMENT', status: 'COMPLETED', recordedBy: null, batch: null },
            { id: 'p2', amount: 1500, date: new Date(), method: 'EFT', reference: 'REF2', category: 'INSTALLMENT', status: 'COMPLETED', recordedBy: null, batch: null },
        ] as any);
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([
            { id: 'i1', invoiceNumber: 'INV062026-1', status: 'SENT', type: 'INVOICE', total: 4500, issuedAt: new Date(), dueAt: new Date(), sentAt: null },
        ] as any);

        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.case.fileNumber).toBe('ZW-0001');
        expect(body.client.idNumber).toBe('9204275246089');
        expect(body.summary.totalPaid).toBe(3000);
        expect(body.summary.outstanding).toBe(1500);
        expect(body.summary.feeBasisTotal).toBe(4500);
        expect(body.summary.feeBasisSource).toBe('CASE_SERVICE_FEE');
        expect(body.summary.feeBasisOutstanding).toBe(1500);
        expect(body.summary.percentCollected).toBe(67);
        expect(body.summary.feeBasisPercentCollected).toBe(67);
        expect(body.payments).toHaveLength(2);
        expect(body.invoices).toHaveLength(1);

        // Payments query must cover case-linked AND unlinked client payments
        const where = vi.mocked(prisma.payment.findMany).mock.calls[0][0]?.where as any;
        expect(where.OR).toEqual([
            { caseId: 'case-1' },
            { clientId: 'client-1', caseId: null },
        ]);
    });

    it('uses an accepted quote as the fee basis when the case service fee is blank', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ ...caseRecord, serviceFee: null } as any);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([
            { id: 'p1', amount: 2250, date: new Date(), method: 'EFT', reference: null, category: 'INSTALLMENT', status: 'COMPLETED', recordedBy: null, batch: null },
        ] as any);
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([
            { id: 'q1', invoiceNumber: 'QUO-2026-0059', status: 'SENT', type: 'QUOTE', total: 4500, issuedAt: new Date(), dueAt: new Date(), sentAt: null, acceptedAt: new Date('2026-07-07') },
        ] as any);

        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.case.serviceFee).toBeNull();
        expect(body.summary.serviceFee).toBeNull();
        expect(body.summary.feeBasisTotal).toBe(4500);
        expect(body.summary.feeBasisSource).toBe('ACCEPTED_QUOTE');
        expect(body.summary.outstanding).toBe(2250);
        expect(body.summary.feeBasisOutstanding).toBe(2250);
        expect(body.summary.feeBasisPercentCollected).toBe(50);
        expect(body.summary.quoteBalance).toBe(2250);
        expect(body.summary.overCollected).toBe(0);
    });

    it('returns 500 with the error message when the database fails', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.case.findUnique).mockRejectedValue(new Error('db down'));
        const res = await GET(makeRequest(), { params });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('db down');
    });
});
