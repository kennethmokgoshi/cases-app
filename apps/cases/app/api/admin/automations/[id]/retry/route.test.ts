import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        automationRun: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { POST } from './route';

const mockAdmin = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false } };
const mockMember = { user: { id: 'u4', isAdmin: false, isExecutive: false, isSeniorManager: false } };
const unauthenticated = null;

const sampleRun = {
    id: 'run-1',
    type: 'DHS_SYNC',
    status: 'FAILED',
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 1000,
    caseId: 'case-1',
    clientId: null,
    errorMessage: 'Network timeout',
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function makeReq(url: string, method = 'POST', body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

function makeIdReq(id: string, method = 'POST', body?: unknown) {
    return {
        req: makeReq(`http://localhost/api/admin/automations/${id}/retry`, method, body),
        ctx: { params: Promise.resolve({ id }) },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('POST /api/admin/automations/[id]/retry', () => {
    it('returns 401 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const { req, ctx } = makeIdReq('run-1');
        const res = await POST(req, ctx);
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin users', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        const { req, ctx } = makeIdReq('run-1');
        const res = await POST(req, ctx);
        expect(res.status).toBe(401);
    });

    it('returns 404 if run not found', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.automationRun.findUnique).mockResolvedValue(null);
        const { req, ctx } = makeIdReq('missing');
        const res = await POST(req, ctx);
        expect(res.status).toBe(404);
    });

    it('returns 400 if run is not FAILED', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.automationRun.findUnique).mockResolvedValue({ ...sampleRun, status: 'SUCCESS' } as any);
        const { req, ctx } = makeIdReq('run-1');
        const res = await POST(req, ctx);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Only failed runs can be retried');
    });

    it('updates status to RETRYING and increments retryCount', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.automationRun.findUnique).mockResolvedValue(sampleRun as any);
        vi.mocked(prisma.automationRun.update).mockResolvedValue({ ...sampleRun, status: 'RETRYING', retryCount: 1 } as any);
        
        const { req, ctx } = makeIdReq('run-1');
        const res = await POST(req, ctx);
        
        expect(res.status).toBe(200);
        expect(prisma.automationRun.update).toHaveBeenCalledWith({
            where: { id: 'run-1' },
            data: {
                status: 'RETRYING',
                retryCount: { increment: 1 },
                nextRetryAt: null,
                errorMessage: null,
                updatedAt: expect.any(Date)
            }
        });
    });
});
