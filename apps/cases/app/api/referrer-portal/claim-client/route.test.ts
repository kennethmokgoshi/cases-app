import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
        },
        user: {
            findMany: vi.fn(),
        },
        inAppNotification: {
            createMany: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { POST } from './route';

function req(body: unknown) {
    return new Request('http://localhost/api/referrer-portal/claim-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/referrer-portal/claim-client', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects invalid inputs', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });

        const res = await POST(req({ clientName: 'a', idNumber: '123' }));

        expect(res.status).toBe(422);
        expect(prisma.case.findFirst).not.toHaveBeenCalled();
    });

    it('submits claim request notification and returns POPIA-safe success response', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-100',
            fileNumber: 'ZDM-100',
            referrerId: null,
        } as never);
        vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'staff-1' }] as never);
        vi.mocked(prisma.inAppNotification.createMany).mockResolvedValueOnce({ count: 1 } as never);

        const res = await POST(req({
            clientName: 'Sipho Nkosi',
            idNumber: '8001015009087',
            cellNumber: '0821234567',
            notes: 'I referred this client last week.',
        }));
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(json.message).toBe('Claim request submitted successfully. Zenowethu staff will review and link the client.');
        expect(json.matchedCase).toEqual({ id: 'case-100', fileNumber: 'ZDM-100' });
        expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { client: { idNumber: '8001015009087' }, deletedAt: null },
        }));
        expect(prisma.inAppNotification.createMany).toHaveBeenCalledWith(expect.objectContaining({
            data: [
                expect.objectContaining({
                    userId: 'staff-1',
                    type: 'CLAIM_CLIENT_REQUEST',
                    caseId: 'case-100',
                    linkUrl: '/cases/case-100',
                }),
            ],
        }));
    });
});
