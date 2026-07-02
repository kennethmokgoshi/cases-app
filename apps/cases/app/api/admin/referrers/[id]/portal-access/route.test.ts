import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn(async () => 'hashed-password'),
    },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

import bcrypt from 'bcryptjs';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { POST } from './route';

const adminSession = {
    user: { id: 'admin-1', isAdmin: true, isExecutive: false, isSeniorManager: false, role: 'ADMIN' },
};

function ctx(id = 'ref-1') {
    return { params: Promise.resolve({ id }) };
}

describe('POST /api/admin/referrers/[id]/portal-access', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires an admin-level user', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);

        const res = await POST(new Request('http://localhost/api/admin/referrers/ref-1/portal-access'), ctx());

        expect(res.status).toBe(401);
    });

    it('requires the referrer to have an email address', async () => {
        vi.mocked(auth).mockResolvedValueOnce(adminSession as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
            email: null,
            portalUser: null,
        } as never);

        const res = await POST(new Request('http://localhost/api/admin/referrers/ref-1/portal-access'), ctx());

        expect(res.status).toBe(422);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('links an existing referrer user without returning a temporary password', async () => {
        vi.mocked(auth).mockResolvedValueOnce(adminSession as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
            email: 'Nomsa@Example.com',
            portalUser: null,
        } as never);
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
            id: 'user-1',
            email: 'nomsa@example.com',
            userType: 'REFERRER',
        } as never);
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({
            id: 'ref-1',
            portalUser: { id: 'user-1', email: 'nomsa@example.com', lastLogin: null, isLocked: false },
        } as never);

        const res = await POST(new Request('http://localhost/api/admin/referrers/ref-1/portal-access'), ctx());
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.temporaryPassword).toBeNull();
        expect(prisma.referrer.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { portalUserId: 'user-1' },
        }));
    });

    it('creates a new referrer portal user and returns the one-time temporary password', async () => {
        vi.mocked(auth).mockResolvedValueOnce(adminSession as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({
            id: 'ref-1',
            firstName: 'Nomsa',
            lastName: 'Dube',
            email: 'Nomsa@Example.com',
            cellNumber: '0820000000',
            idNumber: '8001015009087',
            portalUser: null,
        } as never);
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
        vi.mocked(prisma.user.create).mockResolvedValueOnce({
            id: 'user-1',
            email: 'nomsa@example.com',
            lastLogin: null,
            isLocked: false,
        } as never);
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({ id: 'ref-1' } as never);

        const res = await POST(new Request('http://localhost/api/admin/referrers/ref-1/portal-access'), ctx());
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.temporaryPassword).toMatch(/^Zeno-/);
        expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/^Zeno-/), 10);
        expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                email: 'nomsa@example.com',
                userType: 'REFERRER',
                role: 'MEMBER',
                isAdmin: false,
            }),
        }));
    });
});
