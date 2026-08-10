import { describe, it, expect, vi, beforeEach } from 'vitest';

const userFindManyMock = vi.fn();
const userGroupFindManyMock = vi.fn();
const authMock = vi.fn();

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn((data, init) => ({
            json: async () => data,
            status: init?.status || 200,
        })),
    },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        user: { findMany: (...a: unknown[]) => userFindManyMock(...a) },
        userGroup: { findMany: (...a: unknown[]) => userGroupFindManyMock(...a) },
    },
}));

vi.mock('../auth', () => ({
    auth: (...a: unknown[]) => authMock(...a),
}));

import { createMentionSearchRoute, searchMentionSuggestions } from './mention-search-route';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    firstName: 'Moshe',
    lastName: 'Teane',
    email: 'moshet@zenowethu.co.za',
    username: 'moshet',
    organization: 'Zenowethu',
    ...overrides,
});

const makeGroup = (overrides: Record<string, unknown> = {}) => ({
    id: 'group-1',
    name: 'Zenowethu Letsatsi',
    _count: { members: 8 },
    ...overrides,
});

describe('searchMentionSuggestions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns groups before users, each tagged with their kind', async () => {
        userFindManyMock.mockResolvedValue([makeUser()]);
        userGroupFindManyMock.mockResolvedValue([makeGroup()]);

        const results = await searchMentionSuggestions();

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ kind: 'group', id: 'group-1', name: 'Zenowethu Letsatsi', memberCount: 8 });
        expect(results[1]).toEqual({
            kind: 'user',
            id: 'user-1',
            firstName: 'Moshe',
            lastName: 'Teane',
            email: 'moshet@zenowethu.co.za',
            username: 'moshet',
            organization: 'Zenowethu',
        });
    });

    it('excludes locked users via the where clause', async () => {
        userFindManyMock.mockResolvedValue([]);
        userGroupFindManyMock.mockResolvedValue([]);

        await searchMentionSuggestions();

        expect(userFindManyMock).toHaveBeenCalledWith(
            expect.objectContaining({ where: { isLocked: false } })
        );
    });

    it('returns 401 Unauthorized if unauthenticated', async () => {
        authMock.mockResolvedValue(null);
        const { GET } = createMentionSearchRoute();

        const req = new Request('http://localhost/api/users/search');
        const res = await GET(req);

        expect(res.status).toBe(401);
        expect(userFindManyMock).not.toHaveBeenCalled();
    });

    it('returns the combined suggestion list for an authenticated user', async () => {
        authMock.mockResolvedValue({ user: { id: 'staff-1' } });
        userFindManyMock.mockResolvedValue([makeUser()]);
        userGroupFindManyMock.mockResolvedValue([makeGroup()]);
        const { GET } = createMentionSearchRoute();

        const req = new Request('http://localhost/api/users/search');
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toHaveLength(2);
    });
});
