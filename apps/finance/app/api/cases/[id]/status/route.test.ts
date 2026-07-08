import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        project: { findUnique: vi.fn() },
        projectMember: { count: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    calculateSlaDeadline: vi.fn(() => new Date('2026-07-14T00:00:00.000Z')),
    CaseStatusSchema: {},
    parseBody: vi.fn((_schema: unknown, body: { newStatus?: string; skipNotification?: boolean }) => {
        if (!body?.newStatus) {
            return {
                success: false,
                response: Response.json({ error: 'Validation failed' }, { status: 422 }),
            };
        }
        return { success: true, data: { skipNotification: false, ...body } };
    }),
    getStatusByCode: vi.fn((code: string) => {
        if (code === 'SETTLED_SUCCESS') {
            return {
                code,
                name: 'Settled Successfully',
                slaEnabled: false,
                isOverdueState: false,
            };
        }
        if (code === 'QUOTE_ACCEPTED') {
            return {
                code,
                name: 'Quote Accepted',
                slaEnabled: true,
                slaDays: 5,
                isOverdueState: false,
            };
        }
        return undefined;
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    sendStatusChangeNotification: vi.fn().mockResolvedValue({ errors: [], smsSuccess: false, emailSuccess: false }),
    sendInternalNotification: vi.fn().mockResolvedValue(undefined),
    findManagersForCase: vi.fn().mockResolvedValue([]),
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { PATCH } from './route';

const params = Promise.resolve({ id: 'case-1' });

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/cases/case-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const currentCase = {
    id: 'case-1',
    status: 'QUOTE_ACCEPTED',
    partnerName: null,
    acquisitionType: 'B2C',
    services: null,
    dcEmail: null,
    debtCounsellorName: null,
    client: {
        firstName: 'Nofda',
        lastName: 'Moeng',
        phone: '0614372521',
        email: 'opsgenty@gmail.com',
    },
    projects: [],
};

describe('PATCH /api/cases/[id]/status (finance)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', userType: 'STAFF' } } as never);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(currentCase as never);
        vi.mocked(prisma.case.update).mockResolvedValue({
            ...currentCase,
            status: 'SETTLED_SUCCESS',
            projects: [],
            workflowLogs: [],
        } as never);
        vi.mocked(prisma.projectMember.count).mockResolvedValue(1 as never);
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await PATCH(makeRequest({ newStatus: 'SETTLED_SUCCESS' }), { params });
        expect(res.status).toBe(401);
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('returns 403 for B2B users', async () => {
        vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'b2b-1', userType: 'B2B_PARTNER' } } as never);
        const res = await PATCH(makeRequest({ newStatus: 'SETTLED_SUCCESS' }), { params });
        expect(res.status).toBe(403);
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('rejects unknown workflow statuses', async () => {
        const res = await PATCH(makeRequest({ newStatus: 'NOT_REAL' }), { params });
        expect(res.status).toBe(422);
        expect(prisma.case.update).not.toHaveBeenCalled();
    });

    it('updates the workflow status and writes a workflow log', async () => {
        const res = await PATCH(makeRequest({ newStatus: 'SETTLED_SUCCESS', skipNotification: true }), { params });
        expect(res.status).toBe(200);

        expect(prisma.case.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'case-1' },
            data: expect.objectContaining({
                status: 'SETTLED_SUCCESS',
                updatedBy: { connect: { id: 'user-1' } },
                workflowLogs: {
                    create: expect.objectContaining({
                        fromStatus: 'QUOTE_ACCEPTED',
                        toStatus: 'SETTLED_SUCCESS',
                        userId: 'user-1',
                    }),
                },
            }),
        }));
    });

    it('returns 404 when the case does not exist', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValueOnce(null as never);
        const res = await PATCH(makeRequest({ newStatus: 'SETTLED_SUCCESS' }), { params });
        expect(res.status).toBe(404);
    });
});
