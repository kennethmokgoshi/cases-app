import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import * as pdfLib from '@/lib/commission-statement-pdf';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/commission-statement-pdf', () => ({
    generateCommissionStatementPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

describe('GET /api/admin/referrers/[id]/statement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).mockResolvedValue({
            user: { id: 'admin-1', isAdmin: true },
        });
    });

    it('returns 401 if unauthorized', async () => {
        (auth as any).mockResolvedValueOnce(null);
        const req = new Request('http://localhost/api/admin/referrers/1/statement');
        const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
        expect(res.status).toBe(401);
    });

    it('returns 404 if referrer not found', async () => {
        (prisma.referrer.findUnique as any).mockResolvedValueOnce(null);
        const req = new Request('http://localhost/api/admin/referrers/1/statement');
        const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
        expect(res.status).toBe(404);
    });

    it('generates PDF statement correctly', async () => {
        const mockReferrer = {
            id: 'ref-1',
            firstName: 'Jane',
            lastName: 'Doe',
            bankName: 'FNB',
            commissions: [
                {
                    commissionAmount: { toNumber: () => 1000 },
                    isPaid: true,
                    case: { client: { firstName: 'Client', lastName: 'A' } }
                },
                {
                    commissionAmount: { toNumber: () => 500 },
                    isPaid: false,
                    case: { client: { firstName: 'Client', lastName: 'B' } }
                }
            ]
        };

        (prisma.referrer.findUnique as any).mockResolvedValueOnce(mockReferrer);

        const req = new Request('http://localhost/api/admin/referrers/ref-1/statement');
        const res = await GET(req, { params: Promise.resolve({ id: 'ref-1' }) });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');

        expect(pdfLib.generateCommissionStatementPdf).toHaveBeenCalledWith(
            expect.objectContaining({
                referrerName: 'Jane Doe',
                totalPaid: 1000,
                totalUnpaid: 500,
                totalCommission: 1500,
                lineItems: expect.arrayContaining([
                    expect.objectContaining({ caseClientName: 'Client A', status: 'PAID' }),
                    expect.objectContaining({ caseClientName: 'Client B', status: 'UNPAID' })
                ])
            })
        );
    });
});
