import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/dhs/drr-readiness', () => ({
    runDrrDocumentReadiness: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        debtReviewRemovalConsent: { findFirst: vi.fn() },
    },
}));

import { POST } from './route';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { runDrrDocumentReadiness } from '@zenowethu/shared-lib/src/dhs/drr-readiness';
import { prisma } from '@zenowethu/database';

const run = runDrrDocumentReadiness as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
    debtReviewRemovalConsent: { findFirst: ReturnType<typeof vi.fn> };
};

const request = (body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest('https://app.zenowethu.co.za/api/internal/drr-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });

const okResult = {
    caseId: 'case1', ready: true, presentBefore: [], recoveredBySplit: [], missingAfter: [],
    requiredMissingAfter: [], optionalMissingAfter: [],
    splitAttempted: false, creditReportRequestedFrom: null, documentRequestsCreated: [],
    actionsPerformed: [], errors: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = 'shhh';
    run.mockResolvedValue(okResult);
    db.debtReviewRemovalConsent.findFirst.mockResolvedValue({ id: 'consent1' });
});

describe('POST /api/internal/drr-readiness', () => {
    it('accepts a server-to-server call with the internal secret', async () => {
        const res = await POST(request({ caseId: 'case1' }, { 'x-internal-secret': 'shhh' }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(run).toHaveBeenCalledWith({
            caseId: 'case1',
            triggeredByUserId: undefined,
            runClearanceWhenReady: undefined,
        });
    });

    it('accepts a signed-in staff member and attributes the run to them', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } } as never);

        const res = await POST(request({ caseId: 'case1' }));

        expect(res.status).toBe(200);
        expect(run).toHaveBeenCalledWith({
            caseId: 'case1',
            triggeredByUserId: 'staff1',
            runClearanceWhenReady: undefined,
        });
    });

    it('lets staff run a documents-only check without triggering clearance', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } } as never);

        const res = await POST(request({ caseId: 'case1', runClearanceWhenReady: false }));

        expect(res.status).toBe(200);
        expect(run).toHaveBeenCalledWith({
            caseId: 'case1',
            triggeredByUserId: 'staff1',
            runClearanceWhenReady: false,
        });
    });

    it('rejects staff runs before the consumer has consented', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } } as never);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);

        const res = await POST(request({ caseId: 'case1' }));

        expect(res.status).toBe(403);
        expect(run).not.toHaveBeenCalled();
    });

    it('rejects a wrong secret with no session', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(request({ caseId: 'case1' }, { 'x-internal-secret': 'wrong' }));
        expect(res.status).toBe(401);
        expect(run).not.toHaveBeenCalled();
    });

    it('rejects B2B partner sessions', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p1', userType: 'B2B_PARTNER' } } as never);
        const res = await POST(request({ caseId: 'case1' }));
        expect(res.status).toBe(401);
    });

    it('validates the body', async () => {
        const res = await POST(request({}, { 'x-internal-secret': 'shhh' }));
        expect(res.status).toBe(400);
    });
});
