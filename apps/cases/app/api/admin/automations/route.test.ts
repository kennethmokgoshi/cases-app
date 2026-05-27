import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        automationRun: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const mockAdmin = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false } };
const mockMember = { user: { id: 'u4', isAdmin: false, isExecutive: false, isSeniorManager: false } };
const unauthenticated = null;

const sampleRun = {
    id: 'run-1',
    type: 'DHS_SYNC',
    status: 'SUCCESS',
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 1000,
    caseId: 'case-1',
    clientId: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function makeReq(url: string, method = 'GET', body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/admin/automations', () => {
    it('returns 401 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const res = await GET(makeReq('http://localhost/api/admin/automations'));
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin users', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        const res = await GET(makeReq('http://localhost/api/admin/automations'));
        expect(res.status).toBe(401);
    });

    it('returns paginated runs for admins', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.automationRun.findMany).mockResolvedValue([sampleRun] as any);
        vi.mocked(prisma.automationRun.count).mockResolvedValue(1);
        
        const res = await GET(makeReq('http://localhost/api/admin/automations'));
        const body = await res.json();
        
        expect(res.status).toBe(200);
        expect(body.runs).toHaveLength(1);
        expect(body.total).toBe(1);
    });

    it('passes status and type filters to prisma', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.automationRun.findMany).mockResolvedValue([]);
        vi.mocked(prisma.automationRun.count).mockResolvedValue(0);
        
        await GET(makeReq('http://localhost/api/admin/automations?status=FAILED&type=XDS_SYNC'));
        
        const callArgs = vi.mocked(prisma.automationRun.findMany).mock.calls[0][0] as any;
        expect(callArgs.where.status).toBe('FAILED');
        expect(callArgs.where.type).toBe('XDS_SYNC');
    });
});
