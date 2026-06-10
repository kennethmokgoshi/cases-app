import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@zenowethu/database', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn().mockResolvedValue('hashed-password') },
}));

import { prisma } from '@zenowethu/database';
import {
    getAutomationUserId,
    __resetAutomationUserCache,
    AUTOMATION_USER_EMAIL,
    AUTOMATION_USER_FIRST_NAME,
    AUTOMATION_USER_LAST_NAME,
} from './automation-user';

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const create = prisma.user.create as ReturnType<typeof vi.fn>;

describe('getAutomationUserId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetAutomationUserCache();
    });

    it('returns the existing user id and caches it', async () => {
        findUnique.mockResolvedValue({ id: 'kenny-001' });

        const first = await getAutomationUserId();
        const second = await getAutomationUserId();

        expect(first).toBe('kenny-001');
        expect(second).toBe('kenny-001');
        expect(findUnique).toHaveBeenCalledTimes(1); // second call served from cache
        expect(create).not.toHaveBeenCalled();
    });

    it('creates the Kenny Mokgoshi user when missing, locked and non-admin', async () => {
        findUnique.mockResolvedValue(null);
        create.mockResolvedValue({ id: 'kenny-new' });

        const id = await getAutomationUserId();

        expect(id).toBe('kenny-new');
        expect(create).toHaveBeenCalledTimes(1);
        const data = create.mock.calls[0][0].data;
        expect(data.firstName).toBe(AUTOMATION_USER_FIRST_NAME);
        expect(data.lastName).toBe(AUTOMATION_USER_LAST_NAME);
        expect(data.email).toBe(AUTOMATION_USER_EMAIL);
        expect(data.isLocked).toBe(true);
        expect(data.isAdmin).toBe(false);
        expect(data.userType).toBe('SYSTEM');
    });

    it('recovers when another process created the user concurrently', async () => {
        findUnique
            .mockResolvedValueOnce(null)            // initial lookup: not found
            .mockResolvedValueOnce({ id: 'kenny-raced' }); // post-create-failure lookup
        create.mockRejectedValue(new Error('Unique constraint failed on email'));

        const id = await getAutomationUserId();

        expect(id).toBe('kenny-raced');
    });

    it('returns null instead of throwing on database errors', async () => {
        findUnique.mockRejectedValue(new Error('DB down'));

        const id = await getAutomationUserId();

        expect(id).toBeNull();
    });
});
