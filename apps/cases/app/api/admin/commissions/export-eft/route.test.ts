import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrerCommission: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

describe('GET /api/admin/commissions/export-eft', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).mockResolvedValue({
            user: { id: 'admin-1', isAdmin: true },
        });
    });

    it('returns 401 if unauthorized', async () => {
        (auth as any).mockResolvedValueOnce(null);
        const req = new Request('http://localhost/api/admin/commissions/export-eft');
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('returns 403 if not manager/admin', async () => {
        (auth as any).mockResolvedValueOnce({ user: { id: 'user-1', role: 'STAFF' } });
        const req = new Request('http://localhost/api/admin/commissions/export-eft');
        const res = await GET(req);
        expect(res.status).toBe(403);
    });

    it('returns 400 if no unpaid eligible commissions', async () => {
        (prisma.referrerCommission.findMany as any).mockResolvedValueOnce([]);
        const req = new Request('http://localhost/api/admin/commissions/export-eft');
        const res = await GET(req);
        expect(res.status).toBe(400);
    });

    it('generates a valid EFT CSV with correct headers and data', async () => {
        const mockCommissions = [
            {
                id: 'comm-abc123',
                referrerId: 'ref-1',
                caseId: 'case-1',
                commissionAmount: { toNumber: () => 1500 },
                referrer: {
                    firstName: 'John',
                    lastName: 'Doe',
                    bankName: 'FNB',
                    accountNumber: '6200012345',
                    branchCode: '250655',
                    accountType: 'CHEQUE',
                    accountHolderName: 'John Doe',
                    email: 'john@example.com',
                    idNumber: '8801015000086',
                },
                case: {
                    client: { firstName: 'Jane', lastName: 'Smith' },
                },
            },
        ];
        (prisma.referrerCommission.findMany as any).mockResolvedValueOnce(mockCommissions);

        const req = new Request('http://localhost/api/admin/commissions/export-eft');
        const res = await GET(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('text/csv');
        expect(res.headers.get('Content-Disposition')).toContain('eft-payment-');

        const csv = await res.text();
        const lines = csv.split('\n');

        // Header row
        expect(lines[0]).toContain('Beneficiary Name');
        expect(lines[0]).toContain('Bank Name');
        expect(lines[0]).toContain('Account Number');
        expect(lines[0]).toContain('Branch Code');
        expect(lines[0]).toContain('Amount');

        // Data row
        expect(lines[1]).toContain('John Doe');
        expect(lines[1]).toContain('FNB');
        expect(lines[1]).toContain('6200012345');
        expect(lines[1]).toContain('250655');
        expect(lines[1]).toContain('1500.00');

        // Summary row
        expect(lines[2]).toContain('TOTAL');
        expect(lines[2]).toContain('1500.00');
    });

    it('filters by commissionIds when provided', async () => {
        (prisma.referrerCommission.findMany as any).mockResolvedValueOnce([]);

        const req = new Request('http://localhost/api/admin/commissions/export-eft?commissionIds=c-1,c-2');
        await GET(req);

        expect(prisma.referrerCommission.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: { in: ['c-1', 'c-2'] },
                }),
            })
        );
    });
});
