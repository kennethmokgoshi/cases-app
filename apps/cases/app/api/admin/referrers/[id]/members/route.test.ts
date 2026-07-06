import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const txMock = {
    projectMember: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
    },
};

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: { findUnique: vi.fn() },
        user: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
        project: { findMany: vi.fn() },
        $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, PUT } from './route';

const mockAdmin = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false, role: 'ADMIN' } };
const mockManager = { user: { id: 'u2', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MANAGER' } };
const mockMember = { user: { id: 'u3', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MEMBER' } };

const sampleReferrer = { id: 'ref-1', projectId: 'proj-1', firstName: 'John', lastName: 'Doe' };
const sampleMembers = [
    { id: 'pm-1', projectId: 'proj-1', userId: 'u2', role: 'MEMBER', assignedAt: new Date(), user: { id: 'u2', firstName: 'Thabo', lastName: 'M', email: 't@z.co.za', role: 'MANAGER' } },
];

function makeReq(method = 'GET', body?: unknown) {
    return new Request('http://localhost/api/admin/referrers/ref-1/members', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}
const routeParams = { params: Promise.resolve({ id: 'ref-1' }) };

describe('GET /api/admin/referrers/[id]/members', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(401);
    });

    it('returns 403 for a plain member role', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockMember as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(403);
    });

    it('returns 404 when referrer not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(404);
    });

    it('returns members list for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce(sampleMembers as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.members).toHaveLength(1);
    });

    it('returns 403 for a manager who is not a member of this referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        // manager has no memberships anywhere
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(403);
    });

    it('allows a manager who is a member of the referrer sub-project', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.projectMember.findMany)
            .mockResolvedValueOnce([{ projectId: 'proj-1' }] as never) // membership lookup
            .mockResolvedValueOnce(sampleMembers as never); // members list
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce([{ id: 'proj-1', parentId: null }] as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(200);
    });
});

describe('PUT /api/admin/referrers/[id]/members', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        txMock.projectMember.findMany.mockReset();
        txMock.projectMember.deleteMany.mockReset();
        txMock.projectMember.createMany.mockReset();
    });

    it('returns 403 for manager — only admin/executive can manage members', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        const res = await PUT(makeReq('PUT', { userIds: ['u9'] }), routeParams);
        expect(res.status).toBe(403);
    });

    it('returns 422 on invalid body', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        const res = await PUT(makeReq('PUT', { userIds: 'not-an-array' }), routeParams);
        expect(res.status).toBe(422);
    });

    it('returns 422 when a selected user does not exist', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
        const res = await PUT(makeReq('PUT', { userIds: ['ghost'] }), routeParams);
        expect(res.status).toBe(422);
    });

    it('returns 422 when a selected user is not staff', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.user.findMany).mockResolvedValueOnce([{ id: 'u9', userType: 'B2B_PARTNER' }] as never);
        const res = await PUT(makeReq('PUT', { userIds: ['u9'] }), routeParams);
        expect(res.status).toBe(422);
    });

    it('replaces the member set, preserving retained roles', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
            { id: 'u2', userType: 'STAFF' },
            { id: 'u9', userType: 'STAFF' },
        ] as never);
        txMock.projectMember.findMany
            .mockResolvedValueOnce([{ userId: 'u2', role: 'MANAGER' }]) // existing
            .mockResolvedValueOnce(sampleMembers); // fresh list after write
        const res = await PUT(makeReq('PUT', { userIds: ['u2', 'u9'] }), routeParams);
        expect(res.status).toBe(200);
        expect(txMock.projectMember.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'proj-1' } });
        const [createArgs] = txMock.projectMember.createMany.mock.calls;
        expect(createArgs[0].data).toEqual([
            { projectId: 'proj-1', userId: 'u2', role: 'MANAGER' },
            { projectId: 'proj-1', userId: 'u9', role: 'MEMBER' },
        ]);
    });

    it('allows clearing all members', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
        txMock.projectMember.findMany
            .mockResolvedValueOnce([{ userId: 'u2', role: 'MEMBER' }])
            .mockResolvedValueOnce([]);
        const res = await PUT(makeReq('PUT', { userIds: [] }), routeParams);
        expect(res.status).toBe(200);
        expect(txMock.projectMember.createMany).not.toHaveBeenCalled();
        const json = await res.json();
        expect(json.members).toEqual([]);
    });

    it('returns 422 when referrer has no linked project', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ ...sampleReferrer, projectId: null } as never);
        const res = await PUT(makeReq('PUT', { userIds: [] }), routeParams);
        expect(res.status).toBe(422);
    });
});
