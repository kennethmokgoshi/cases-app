import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyMock = vi.fn();
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
        case: { findMany: (...a: unknown[]) => findManyMock(...a) },
    },
}));

vi.mock('../auth', () => ({
    auth: (...a: unknown[]) => authMock(...a),
}));

import { createCaseSearchRoute, searchCases } from './case-search-route';

const makeCase = (overrides: Record<string, unknown> = {}) => ({
    id: 'case-1',
    fileNumber: 'ZDM-2026-1016-2DD',
    status: 'COMPLETED',
    client: {
        firstName: 'Thapelo Mathabe',
        lastName: 'Sefala',
        idNumber: '8406276118081',
    },
    projects: [{ project: { name: 'ZDM Client' } }],
    ...overrides,
});

describe('searchCases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('matches names case-insensitively (surname search like "sefala")', async () => {
        findManyMock.mockResolvedValue([makeCase()]);

        const results = await searchCases('sefala');

        const where = findManyMock.mock.calls[0][0].where;
        expect(where.deletedAt).toEqual({ equals: null });
        expect(where.OR).toContainEqual({
            client: { lastName: { contains: 'sefala', mode: 'insensitive' } },
        });
        expect(where.OR).toContainEqual({
            client: { firstName: { contains: 'sefala', mode: 'insensitive' } },
        });
        expect(where.OR).toContainEqual({
            client: { idNumber: { contains: 'sefala', mode: 'insensitive' } },
        });
        expect(results).toEqual([
            {
                id: 'case-1',
                fileNumber: 'ZDM-2026-1016-2DD',
                clientName: 'Thapelo Mathabe Sefala',
                clientIdNumber: '8406276118081',
                status: 'COMPLETED',
                project: 'ZDM Client',
            },
        ]);
    });

    it('returns the 5 most recent non-deleted cases when the query is empty', async () => {
        findManyMock.mockResolvedValue([makeCase()]);

        await searchCases(undefined);

        const args = findManyMock.mock.calls[0][0];
        expect(args.where).toEqual({ deletedAt: { equals: null } });
        expect(args.take).toBe(5);
        expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    });

    it('falls back to "No Project" when no primary project is linked', async () => {
        findManyMock.mockResolvedValue([makeCase({ projects: [] })]);

        const results = await searchCases('sefala');
        expect(results[0].project).toBe('No Project');
    });
});

describe('createCaseSearchRoute GET', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const { GET } = createCaseSearchRoute();

    it('rejects unauthenticated requests with 401', async () => {
        authMock.mockResolvedValue(null);

        const res = await GET(new Request('http://localhost/api/cases/search?q=sefala'));

        expect(res.status).toBe(401);
        expect(findManyMock).not.toHaveBeenCalled();
    });

    it('returns an empty list for one-character queries without hitting the DB', async () => {
        authMock.mockResolvedValue({ user: { id: 'user-1' } });

        const res = await GET(new Request('http://localhost/api/cases/search?q=s'));

        expect(await res.json()).toEqual([]);
        expect(findManyMock).not.toHaveBeenCalled();
    });

    it('returns formatted suggestions for an authenticated search', async () => {
        authMock.mockResolvedValue({ user: { id: 'user-1' } });
        findManyMock.mockResolvedValue([makeCase()]);

        const res = await GET(new Request('http://localhost/api/cases/search?q=sefala'));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toHaveLength(1);
        expect(body[0].clientName).toBe('Thapelo Mathabe Sefala');
    });

    it('returns 500 when the database query fails', async () => {
        authMock.mockResolvedValue({ user: { id: 'user-1' } });
        findManyMock.mockRejectedValue(new Error('db down'));

        const res = await GET(new Request('http://localhost/api/cases/search?q=sefala'));

        expect(res.status).toBe(500);
    });
});
