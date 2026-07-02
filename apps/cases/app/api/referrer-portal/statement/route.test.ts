import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@/lib/commission-statement-pdf', () => ({
    generateCommissionStatementPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findUnique: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { generateCommissionStatementPdf } from '@/lib/commission-statement-pdf';
import { GET } from './route';

describe('GET /api/referrer-portal/statement', () => {
    beforeEach(() => vi.clearAllMocks());

    it('generates a statement with masked consumer names', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
            email: 'nomsa@example.com',
            bankName: null,
            accountNumber: null,
            branchCode: null,
            accountHolderName: null,
            commissions: [
                {
                    isPaid: false,
                    commissionAmount: { toNumber: () => 200 },
                    paidAt: null,
                    paymentRef: null,
                    case: { client: { firstName: 'Thabo', lastName: 'Mokoena' } },
                },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/referrer-portal/statement'));

        expect(res.status).toBe(200);
        expect(generateCommissionStatementPdf).toHaveBeenCalledWith(expect.objectContaining({
            lineItems: [expect.objectContaining({ caseClientName: 'T. Mokoena' })],
            totalUnpaid: 200,
        }));
        expect(JSON.stringify(vi.mocked(generateCommissionStatementPdf).mock.calls[0][0])).not.toContain('Thabo Mokoena');
    });
});
