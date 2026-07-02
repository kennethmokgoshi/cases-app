import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            update: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { PATCH } from './route';

function req(body: unknown) {
    return new Request('http://localhost/api/referrer-portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PATCH /api/referrer-portal/profile', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the access error when the user has no portal referrer', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: false,
            status: 401,
            error: 'Unauthorized',
        });

        const res = await PATCH(req({ email: 'ref@example.com' }));

        expect(res.status).toBe(401);
        expect(prisma.referrer.update).not.toHaveBeenCalled();
    });

    it('updates only the linked referrer profile fields', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
            email: 'ref@example.com',
            cellNumber: '0820000000',
            bankName: 'FNB',
            accountNumber: '123456789',
            accountType: 'CHEQUE',
            branchCode: '250655',
            accountHolderName: 'Nomsa Dube',
            fixedCommissionAmount: { toNumber: () => 200 },
            commissionType: 'FIXED',
        } as never);

        const res = await PATCH(req({
            email: 'ref@example.com',
            cellNumber: '0820000000',
            bankName: 'FNB',
            accountNumber: '123456789',
            accountType: 'CHEQUE',
            branchCode: '250655',
            accountHolderName: 'Nomsa Dube',
        }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.referrer.fixedCommissionAmount).toBe(200);
        expect(prisma.referrer.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'ref-1' },
            data: expect.objectContaining({ email: 'ref@example.com', accountNumber: '123456789' }),
        }));
    });
});
