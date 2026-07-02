import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findFirst: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from './referrer-portal-access';

describe('getCurrentReferrerPortalAccess', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when no user is signed in', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);

        await expect(getCurrentReferrerPortalAccess()).resolves.toEqual({
            ok: false,
            status: 401,
            error: 'Unauthorized',
        });
    });

    it('returns 403 when the user has no active linked referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
        vi.mocked(prisma.referrer.findFirst).mockResolvedValueOnce(null);

        const result = await getCurrentReferrerPortalAccess();

        expect(result.ok).toBe(false);
        if (result.ok === true) throw new Error('Expected access to fail');
        expect(result.status).toBe(403);
        expect(prisma.referrer.findFirst).toHaveBeenCalledWith({
            where: { portalUserId: 'user-1', isActive: true },
            select: { id: true, firstName: true, lastName: true },
        });
    });

    it('returns the active referrer linked to the signed-in user', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
        vi.mocked(prisma.referrer.findFirst).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
        } as never);

        await expect(getCurrentReferrerPortalAccess()).resolves.toEqual({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'Nomsa', lastName: 'Dube' },
        });
    });
});
