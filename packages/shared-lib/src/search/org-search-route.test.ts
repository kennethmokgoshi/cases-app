import { describe, it, expect, vi, beforeEach } from 'vitest';

const projectFindManyMock = vi.fn();
const referrerFindManyMock = vi.fn();
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
        project: { findMany: (...a: unknown[]) => projectFindManyMock(...a) },
        referrer: { findMany: (...a: unknown[]) => referrerFindManyMock(...a) },
    },
}));

vi.mock('../auth', () => ({
    auth: (...a: unknown[]) => authMock(...a),
}));

import { createOrgSearchRoute, searchOrgEntities } from './org-search-route';

const makeProject = (overrides: Record<string, unknown> = {}) => ({
    id: 'proj-1',
    name: 'Letsatsi - Paul Kruger 1',
    type: 'BRANCH',
    clientType: 'B2B',
    parentId: 'proj-root',
    parent: { id: 'proj-root', name: 'Letsatsi', type: 'ACQUISITION_SOURCE' },
    _count: { cases: 42, children: 0 },
    ...overrides,
});

const makeReferrer = (overrides: Record<string, unknown> = {}) => ({
    id: 'ref-1',
    firstName: 'William',
    lastName: 'Mabena',
    cellNumber: '0821234567',
    email: 'william@example.com',
    idNumber: '8501015800081',
    referrerType: 'COMMISSION',
    project: { id: 'proj-1', name: 'Letsatsi - Paul Kruger 1' },
    parentReferrer: null,
    ...overrides,
});

describe('searchOrgEntities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('searches for referrers like "William" and projects like "Paul Kruger 1"', async () => {
        projectFindManyMock.mockResolvedValue([makeProject()]);
        referrerFindManyMock.mockResolvedValue([makeReferrer()]);

        const results = await searchOrgEntities('William');

        expect(results).toHaveLength(2);
        
        // Project Result (Branch)
        const branchResult = results.find(r => r.entityType === 'BRANCH');
        expect(branchResult).toBeDefined();
        expect(branchResult?.name).toBe('Letsatsi - Paul Kruger 1');
        expect(branchResult?.typeLabel).toBe('Branch');
        expect(branchResult?.subtitle).toContain('Under Letsatsi');

        // Referrer Result
        const referrerResult = results.find(r => r.entityType === 'REFERRER');
        expect(referrerResult).toBeDefined();
        expect(referrerResult?.name).toBe('William Mabena');
        expect(referrerResult?.typeLabel).toBe('Referrer');
        expect(referrerResult?.subtitle).toContain('0821234567');
        expect(referrerResult?.href).toBe('/admin/referrers/ref-1/clients');
    });

    it('correctly classifies Main Sources, Branches, and Sub-Projects', async () => {
        projectFindManyMock.mockResolvedValue([
            makeProject({ id: 'ms-1', name: 'Letsatsi Main', type: 'ACQUISITION_SOURCE', parentId: null, parent: null }),
            makeProject({ id: 'br-1', name: 'Paul Kruger 1', type: 'BRANCH', parentId: 'ms-1', parent: { name: 'Letsatsi Main', type: 'ACQUISITION_SOURCE' } }),
            makeProject({ id: 'sub-1', name: '2026 Batch A', type: 'FOLDER', parentId: 'br-1', parent: { name: 'Paul Kruger 1', type: 'BRANCH' } })
        ]);
        referrerFindManyMock.mockResolvedValue([]);

        const results = await searchOrgEntities('Letsatsi');

        expect(results).toHaveLength(3);

        expect(results[0].entityType).toBe('MAIN_SOURCE');
        expect(results[0].typeLabel).toBe('Main Source');

        expect(results[1].entityType).toBe('BRANCH');
        expect(results[1].typeLabel).toBe('Branch');

        expect(results[2].entityType).toBe('SUB_PROJECT');
        expect(results[2].typeLabel).toBe('Sub-Project');
    });

    it('returns empty array when query is less than 2 characters in route', async () => {
        authMock.mockResolvedValue({ user: { id: 'user-1' } });
        const { GET } = createOrgSearchRoute();
        
        const req = new Request('http://localhost/api/projects/search?q=a');
        const res = await GET(req);
        const data = await res.json();

        expect(data).toEqual([]);
        expect(projectFindManyMock).not.toHaveBeenCalled();
    });

    it('returns 401 Unauthorized if unauthenticated', async () => {
        authMock.mockResolvedValue(null);
        const { GET } = createOrgSearchRoute();

        const req = new Request('http://localhost/api/projects/search?q=William');
        const res = await GET(req);

        expect(res.status).toBe(401);
    });
});
