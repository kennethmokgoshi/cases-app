import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH, GET } from './route';

// --- Mocks ---

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    }),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.case.findUnique);
const mockUpdate = vi.mocked(prisma.case.update);

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/cases/case-1/r350', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makeGetRequest(): Request {
    return new Request('http://localhost/api/cases/case-1/r350', { method: 'GET' });
}

const params = Promise.resolve({ id: 'case-1' });

const staffSession = {
    user: { id: 'user-1', userType: 'STAFF', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MEMBER' },
};
const adminSession = {
    user: { id: 'admin-1', userType: 'STAFF', isAdmin: true, isExecutive: false, isSeniorManager: false, role: 'ADMIN' },
};

const b2cCase = { id: 'case-1', r350Status: 'PENDING', acquisitionType: 'B2C', fileNumber: 'ZDM0001' };
const b2bCase = { id: 'case-1', r350Status: 'NOT_APPLICABLE', acquisitionType: 'B2B', fileNumber: 'ZDM0002' };

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('PATCH /api/cases/[id]/r350', () => {
    it('returns 401 when unauthenticated', async () => {
        mockAuth.mockResolvedValueOnce(null as never);
        const res = await PATCH(makeRequest({ action: 'pay' }), { params });
        expect(res.status).toBe(401);
    });

    it('returns 404 when case does not exist', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(null as never);
        const res = await PATCH(makeRequest({ action: 'pay' }), { params });
        expect(res.status).toBe(404);
    });

    it('returns 422 for B2B cases', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(b2bCase as never);
        const res = await PATCH(makeRequest({ action: 'pay' }), { params });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error).toMatch(/B2B/);
    });

    it('marks R350 as paid with defaults', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(b2cCase as never);
        mockUpdate.mockResolvedValueOnce({ ...b2cCase, r350Status: 'PAID_R350', r350Waived: false } as never);

        const res = await PATCH(makeRequest({ action: 'pay' }), { params });
        expect(res.status).toBe(200);

        const updateCall = (mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
        expect(updateCall.r350Status).toBe('PAID_R350');
        expect(updateCall.r350Waived).toBe(false);
        expect(updateCall.r350PaidById).toBe('user-1');
        expect(updateCall.r350PaidDate).toBeInstanceOf(Date);
    });

    it('marks R350 as paid with custom date and ref', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(b2cCase as never);
        mockUpdate.mockResolvedValueOnce({ ...b2cCase, r350Status: 'PAID_R350' } as never);

        await PATCH(
            makeRequest({ action: 'pay', paidDate: '2026-03-15T00:00:00Z', paidRef: 'ABC123' }),
            { params },
        );

        const updateCall = (mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
        expect(updateCall.r350PaidRef).toBe('ABC123');
        expect((updateCall.r350PaidDate as Date).toISOString()).toContain('2026-03-15');
    });

    it('waives R350 with reason', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(b2cCase as never);
        mockUpdate.mockResolvedValueOnce({ ...b2cCase, r350Status: 'WAIVED', r350Waived: true } as never);

        const res = await PATCH(makeRequest({ action: 'waive', reason: 'Hardship case' }), { params });
        expect(res.status).toBe(200);

        const updateCall = (mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
        expect(updateCall.r350Status).toBe('WAIVED');
        expect(updateCall.r350Waived).toBe(true);
        expect(updateCall.r350WaivedReason).toBe('Hardship case');
        expect(updateCall.r350WaivedById).toBe('user-1');
    });

    it('returns 422 when waive reason is empty', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(b2cCase as never);
        const res = await PATCH(makeRequest({ action: 'waive', reason: '' }), { params });
        expect(res.status).toBe(422);
    });

    it('rejects reset for non-admin/executive', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce({ ...b2cCase, r350Status: 'PAID_R350' } as never);
        const res = await PATCH(makeRequest({ action: 'reset' }), { params });
        expect(res.status).toBe(403);
    });

    it('allows reset for admin', async () => {
        mockAuth.mockResolvedValueOnce(adminSession as never);
        mockFindUnique.mockResolvedValueOnce({ ...b2cCase, r350Status: 'PAID_R350' } as never);
        mockUpdate.mockResolvedValueOnce({ ...b2cCase, r350Status: 'PENDING' } as never);

        const res = await PATCH(makeRequest({ action: 'reset' }), { params });
        expect(res.status).toBe(200);

        const updateCall = (mockUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
        expect(updateCall.r350Status).toBe('PENDING');
        expect(updateCall.r350Waived).toBe(false);
    });
});

// ---------------------------------------------------------------------------
describe('GET /api/cases/[id]/r350', () => {
    it('returns 401 when unauthenticated', async () => {
        mockAuth.mockResolvedValueOnce(null as never);
        const res = await GET(makeGetRequest(), { params });
        expect(res.status).toBe(401);
    });

    it('returns 404 when case not found', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce(null as never);
        const res = await GET(makeGetRequest(), { params });
        expect(res.status).toBe(404);
    });

    it('returns R350 status data', async () => {
        mockAuth.mockResolvedValueOnce(staffSession as never);
        mockFindUnique.mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM0001',
            r350Status: 'PAID_R350',
            r350PaidDate: new Date('2026-03-01'),
            r350PaidRef: 'REF001',
            r350Waived: false,
            r350WaivedAt: null,
            r350WaivedReason: null,
            acquisitionType: 'B2C',
            r350PaidBy: { firstName: 'John', lastName: 'Doe' },
            r350WaivedBy: null,
        } as never);

        const res = await GET(makeGetRequest(), { params });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.r350Status).toBe('PAID_R350');
        expect(data.r350PaidRef).toBe('REF001');
    });
});
