import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn(async () => 'hashed-agent-password'),
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import bcrypt from 'bcryptjs';
import {
    REFERRER_PORTAL_DEFAULT_PASSWORD,
    getCurrentReferrerPortalAccess,
    provisionReferrerPortalUser,
} from './referrer-portal-access';

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

describe('provisionReferrerPortalUser', () => {
    beforeEach(() => vi.clearAllMocks());

    const referrer = {
        id: 'ref-1',
        firstName: 'Nomsa',
        lastName: 'Dube',
        idNumber: '8001015009087',
        cellNumber: '0820000000',
        portalUser: null,
    };

    it('creates a referrer user with the ID number as username and Agent@1 as the default password', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
        vi.mocked(prisma.user.create).mockResolvedValueOnce({
            id: 'user-1',
            username: '8001015009087',
            email: 'referrer.8001015009087@portal.zenowethu.local',
            lastLogin: null,
            isLocked: false,
        } as never);
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({ id: 'ref-1' } as never);

        const result = await provisionReferrerPortalUser(referrer);

        expect(result.defaultPassword).toBe(REFERRER_PORTAL_DEFAULT_PASSWORD);
        expect(result.created).toBe(true);
        expect(bcrypt.hash).toHaveBeenCalledWith('Agent@1', 10);
        expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                username: '8001015009087',
                password: 'hashed-agent-password',
                userType: 'REFERRER',
                emailNotificationsEnabled: false,
            }),
        }));
        expect(prisma.referrer.update).toHaveBeenCalledWith({
            where: { id: 'ref-1' },
            data: { portalUserId: 'user-1' },
        });
    });

    it('links an existing referrer user with the same ID-number username', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
            id: 'user-1',
            username: '8001015009087',
            email: 'referrer.8001015009087@portal.zenowethu.local',
            lastLogin: null,
            isLocked: false,
            userType: 'REFERRER',
        } as never);
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({
            id: 'ref-1',
            portalUser: {
                id: 'user-1',
                username: '8001015009087',
                email: 'referrer.8001015009087@portal.zenowethu.local',
                lastLogin: null,
                isLocked: false,
            },
        } as never);

        const result = await provisionReferrerPortalUser(referrer);

        expect(result.created).toBe(false);
        expect(result.defaultPassword).toBeNull();
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects provisioning when the referrer has no ID number', async () => {
        await expect(provisionReferrerPortalUser({ ...referrer, idNumber: null }))
            .rejects.toThrow('Referrer must have an ID number');
    });
});
