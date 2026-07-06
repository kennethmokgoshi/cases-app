import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        project: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        projectMember: {
            findMany: vi.fn(),
        },
        caseProject: {
            count: vi.fn(),
        },
        referrerCommission: {
            groupBy: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST } from './route';
import { GET as GET_ID, PATCH, DELETE } from './[id]/route';

const mockAdmin = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false, role: 'ADMIN' } };
const mockManager = { user: { id: 'u2', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MANAGER' } };
const mockMember = { user: { id: 'u3', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MEMBER' } };

const sampleReferrer = {
    id: 'ref-1',
    firstName: 'John',
    lastName: 'Doe',
    idNumber: '8001015009087',
    email: 'john@example.com',
    cellNumber: '0821234567',
    employerName: 'Acme Corp',
    employmentType: 'EMPLOYED',
    employerAddress: null,
    employerPhone: null,
    occupation: 'Sales Rep',
    monthlyIncome: 25000,
    bankName: 'FNB',
    accountNumber: '62123456789',
    accountType: 'CHEQUE',
    branchCode: '250655',
    accountHolderName: 'John Doe',
    projectId: 'proj-1',
    isActive: true,
    notes: null,
    createdById: 'u1',
    createdAt: new Date('2026-04-28'),
    updatedAt: new Date('2026-04-28'),
    project: { id: 'proj-1', name: 'John Doe' },
    _count: { cases: 0 },
};

function makeReq(url: string, method = 'GET', body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

function makeIdReq(id: string, method = 'GET', body?: unknown) {
    return makeReq(`http://localhost/api/admin/referrers/${id}`, method, body);
}

describe('GET /api/admin/referrers', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET(makeReq('http://localhost/api/admin/referrers'));
        expect(res.status).toBe(401);
    });

    it('returns 403 for non-manager role', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockMember as never);
        const res = await GET(makeReq('http://localhost/api/admin/referrers'));
        expect(res.status).toBe(403);
    });

    it('returns paginated list for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findMany).mockResolvedValueOnce([sampleReferrer] as never);
        vi.mocked(prisma.referrer.count).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.referrerCommission.groupBy as any).mockResolvedValue([]);
        const res = await GET(makeReq('http://localhost/api/admin/referrers'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.referrers).toHaveLength(1);
        expect(json.meta.total).toBe(1);
    });

    it('does not apply membership filtering for admins', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.referrer.count).mockResolvedValue(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.referrerCommission.groupBy as any).mockResolvedValue([]);
        const res = await GET(makeReq('http://localhost/api/admin/referrers'));
        expect(res.status).toBe(200);
        const [callArgs] = vi.mocked(prisma.referrer.findMany).mock.calls;
        expect(callArgs[0].where).not.toHaveProperty('projectId');
        expect(vi.mocked(prisma.projectMember.findMany)).not.toHaveBeenCalled();
    });

    it('filters non-admin managers to referrers whose sub-project they belong to', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([{ projectId: 'proj-1' }] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
            { id: 'referrals-root', parentId: null },
            { id: 'proj-1', parentId: 'referrals-root' },
            { id: 'proj-1-child', parentId: 'proj-1' },
            { id: 'proj-2', parentId: 'referrals-root' },
        ] as never);
        vi.mocked(prisma.referrer.findMany).mockResolvedValueOnce([sampleReferrer] as never);
        vi.mocked(prisma.referrer.count).mockResolvedValue(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.referrerCommission.groupBy as any).mockResolvedValue([]);
        const res = await GET(makeReq('http://localhost/api/admin/referrers'));
        expect(res.status).toBe(200);
        const [callArgs] = vi.mocked(prisma.referrer.findMany).mock.calls;
        const projectFilter = (callArgs[0].where as { projectId: { in: string[] } }).projectId;
        expect(projectFilter.in).toContain('proj-1');
        expect(projectFilter.in).toContain('proj-1-child'); // descendants included
        expect(projectFilter.in).not.toContain('proj-2');
    });

    it('returns an empty list for a manager with no memberships', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.referrer.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.referrer.count).mockResolvedValue(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.referrerCommission.groupBy as any).mockResolvedValue([]);
        const res = await GET(makeReq('http://localhost/api/admin/referrers'));
        expect(res.status).toBe(200);
        const [callArgs] = vi.mocked(prisma.referrer.findMany).mock.calls;
        expect((callArgs[0].where as { projectId: { in: string[] } }).projectId.in).toEqual([]);
    });

    it('applies search filter', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findMany).mockResolvedValueOnce([] as never);
        vi.mocked(prisma.referrer.count).mockResolvedValue(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.referrerCommission.groupBy as any).mockResolvedValue([]);
        const res = await GET(makeReq('http://localhost/api/admin/referrers?search=John'));
        expect(res.status).toBe(200);
        const [callArgs] = vi.mocked(prisma.referrer.findMany).mock.calls;
        expect(callArgs[0].where).toHaveProperty('OR');
    });
});

describe('POST /api/admin/referrers', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'A', lastName: 'B', idNumber: '8001015009087' }));
        expect(res.status).toBe(401);
    });

    it('returns 403 for member role', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockMember as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'A', lastName: 'B', idNumber: '8001015009087' }));
        expect(res.status).toBe(403);
    });

    it('returns 422 for missing required fields', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'John' }));
        expect(res.status).toBe(422);
    });

    it('returns 409 when ID number already exists', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'John', lastName: 'Doe', idNumber: '8001015009087' }));
        expect(res.status).toBe(409);
    });

    it('allows manager to create a referrer (add-only role)', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({ id: 'root-proj', name: 'Referrals' } as never);
        vi.mocked(prisma.project.create).mockResolvedValueOnce({ id: 'proj-1', name: 'John Doe' } as never);
        vi.mocked(prisma.referrer.create).mockResolvedValueOnce({ ...sampleReferrer } as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'John', lastName: 'Doe', idNumber: '8001015009087' }));
        expect(res.status).toBe(201);
    });

    it('creates referrer and sub-project for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({ id: 'root-proj', name: 'Referrals' } as never);
        vi.mocked(prisma.project.create).mockResolvedValueOnce({ id: 'proj-1', name: 'John Doe' } as never);
        vi.mocked(prisma.referrer.create).mockResolvedValueOnce({ ...sampleReferrer } as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'John', lastName: 'Doe', idNumber: '8001015009087' }));
        expect(res.status).toBe(201);
    });

    it('creates root Referrals project if none exists', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        vi.mocked(prisma.project.findFirst).mockResolvedValueOnce(null);
        vi.mocked(prisma.project.create)
            .mockResolvedValueOnce({ id: 'root-proj', name: 'Referrals' } as never)
            .mockResolvedValueOnce({ id: 'proj-1', name: 'John Doe' } as never);
        vi.mocked(prisma.referrer.create).mockResolvedValueOnce({ ...sampleReferrer } as never);
        const res = await POST(makeReq('http://localhost/api/admin/referrers', 'POST', { firstName: 'John', lastName: 'Doe', idNumber: '8001015009087' }));
        expect(res.status).toBe(201);
        expect(vi.mocked(prisma.project.create)).toHaveBeenCalledTimes(2);
    });
});

describe('GET /api/admin/referrers/[id]', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET_ID(makeIdReq('ref-1'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(401);
    });

    it('returns 404 when not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        const res = await GET_ID(makeIdReq('ref-999'), { params: Promise.resolve({ id: 'ref-999' }) });
        expect(res.status).toBe(404);
    });

    it('returns referrer with cases for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ ...sampleReferrer, cases: [] } as never);
        const res = await GET_ID(makeIdReq('ref-1'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(200);
    });

    it('returns 403 for a manager who is not a member of the referrer sub-project', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ ...sampleReferrer, cases: [] } as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        const res = await GET_ID(makeIdReq('ref-1'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(403);
    });

    it('allows a manager who is a member of the referrer sub-project', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ ...sampleReferrer, cases: [] } as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([{ projectId: 'proj-1' }] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce([{ id: 'proj-1', parentId: null }] as never);
        const res = await GET_ID(makeIdReq('ref-1'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(200);
    });
});

describe('PATCH /api/admin/referrers/[id]', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 403 for member', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockMember as never);
        const res = await PATCH(makeIdReq('ref-1', 'PATCH', { notes: 'test' }), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(403);
    });

    it('returns 403 for manager — only admin/executive can edit', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        const res = await PATCH(makeIdReq('ref-1', 'PATCH', { notes: 'test' }), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(403);
    });

    it('allows admin to add an ID number to an existing referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique)
            .mockResolvedValueOnce({ ...sampleReferrer, idNumber: null } as never) // existing lookup
            .mockResolvedValueOnce(null); // duplicate check
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({ ...sampleReferrer } as never);
        const res = await PATCH(makeIdReq('ref-1', 'PATCH', { idNumber: '8001015009087' }), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(200);
        const [updateArgs] = vi.mocked(prisma.referrer.update).mock.calls;
        expect(updateArgs[0].data).toMatchObject({ idNumber: '8001015009087' });
    });

    it('returns 409 when new ID number belongs to another referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique)
            .mockResolvedValueOnce({ ...sampleReferrer, idNumber: null } as never) // existing lookup
            .mockResolvedValueOnce({ ...sampleReferrer, id: 'ref-2' } as never); // duplicate check hit
        const res = await PATCH(makeIdReq('ref-1', 'PATCH', { idNumber: '8001015009087' }), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(409);
        expect(vi.mocked(prisma.referrer.update)).not.toHaveBeenCalled();
    });

    it('returns 422 for an ID number that is not 13 digits', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        const res = await PATCH(makeIdReq('ref-1', 'PATCH', { idNumber: '12345' }), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(422);
    });

    it('returns 404 when referrer not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        const res = await PATCH(makeIdReq('ref-999', 'PATCH', { notes: 'test' }), { params: Promise.resolve({ id: 'ref-999' }) });
        expect(res.status).toBe(404);
    });

    it('updates referrer and renames project when name changes', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.project.update).mockResolvedValueOnce({ id: 'proj-1', name: 'Jane Doe' } as never);
        vi.mocked(prisma.referrer.update).mockResolvedValueOnce({ ...sampleReferrer, lastName: 'Smith' } as never);
        const res = await PATCH(makeIdReq('ref-1', 'PATCH', { lastName: 'Smith' }), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(200);
        expect(vi.mocked(prisma.project.update)).toHaveBeenCalledOnce();
    });
});

describe('DELETE /api/admin/referrers/[id]', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 403 for manager (not admin/executive)', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        const res = await DELETE(makeIdReq('ref-1', 'DELETE'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(403);
    });

    it('returns 404 when not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        const res = await DELETE(makeIdReq('ref-999', 'DELETE'), { params: Promise.resolve({ id: 'ref-999' }) });
        expect(res.status).toBe(404);
    });

    it('returns 422 when referrer has linked cases', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ ...sampleReferrer, _count: { cases: 3 } } as never);
        const res = await DELETE(makeIdReq('ref-1', 'DELETE'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(422);
    });

    it('deletes referrer and empty sub-project for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce({ ...sampleReferrer, _count: { cases: 0 } } as never);
        vi.mocked(prisma.caseProject.count).mockResolvedValueOnce(0);
        vi.mocked(prisma.project.delete).mockResolvedValueOnce({} as never);
        vi.mocked(prisma.referrer.delete).mockResolvedValueOnce({} as never);
        const res = await DELETE(makeIdReq('ref-1', 'DELETE'), { params: Promise.resolve({ id: 'ref-1' }) });
        expect(res.status).toBe(200);
        expect(vi.mocked(prisma.project.delete)).toHaveBeenCalledOnce();
        expect(vi.mocked(prisma.referrer.delete)).toHaveBeenCalledOnce();
    });
});
