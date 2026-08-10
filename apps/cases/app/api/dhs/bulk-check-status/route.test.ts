import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { closeBrowser } from '@zenowethu/shared-lib/src/dhs';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { POST as dhsLookupPost } from '../lookup/route';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/dhs', () => ({
    closeBrowser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@zenowethu/shared-lib/src/automation/run-logger', () => ({
    logAutomationRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lookup/route', () => ({
    POST: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        project: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
        case: { findMany: vi.fn(), findUnique: vi.fn() },
    },
}));

const db = prisma as unknown as {
    project: { findMany: ReturnType<typeof vi.fn> };
    projectMember: { findMany: ReturnType<typeof vi.fn> };
    case: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
};

function makeReq(body: any) {
    return new Request('https://app.zenowethu.co.za/api/dhs/bulk-check-status', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

function okLookupResponse(json: any) {
    return NextResponse.json(json, { status: 200 });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin1', isAdmin: true, role: 'ADMIN' } } as any);
    db.project.findMany.mockResolvedValue([]);
});

describe('POST /api/dhs/bulk-check-status', () => {
    it('returns 401 when there is no session', async () => {
        vi.mocked(auth).mockResolvedValue(null as any);
        const res = await POST(makeReq({ caseIds: ['case-1'] }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when caseIds is missing or empty', async () => {
        const res = await POST(makeReq({}));
        expect(res.status).toBe(400);
        const res2 = await POST(makeReq({ caseIds: [] }));
        expect(res2.status).toBe(400);
    });

    it('checks each eligible case via the existing single-case DHS lookup route and aggregates outcomes', async () => {
        db.case.findMany.mockResolvedValue([
            { id: 'case-1', fileNumber: 'ZDM-001', status: 'REQUESTED_VIA_DHS', client: { idNumber: '8001015009087', firstName: 'Jane', lastName: 'Doe' } },
            { id: 'case-2', fileNumber: 'ZDM-002', status: 'REQUESTED_VIA_DHS', client: { idNumber: '8501015009087', firstName: 'John', lastName: 'Smith' } },
        ]);
        vi.mocked(dhsLookupPost)
            .mockResolvedValueOnce(okLookupResponse({ success: true, status: 'ACCEPTED', message: 'Status is Accepted.' }))
            .mockResolvedValueOnce(okLookupResponse({ success: true, status: 'DECLINED', message: 'Status is Declined.' }));
        db.case.findUnique
            .mockResolvedValueOnce({ status: 'ACCEPTED_VIA_DHS' })
            .mockResolvedValueOnce({ status: 'DECLINED_VIA_DHS' });

        const res = await POST(makeReq({ caseIds: ['case-1', 'case-2'] }));
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(dhsLookupPost).toHaveBeenCalledTimes(2);
        expect(body.processed).toBe(2);
        expect(body.summary).toMatchObject({ accepted: 1, declined: 1, errors: 0 });
        expect(body.results[0]).toMatchObject({ caseId: 'case-1', newStatus: 'ACCEPTED_VIA_DHS' });
        expect(body.results[1]).toMatchObject({ caseId: 'case-2', newStatus: 'DECLINED_VIA_DHS' });
        expect(closeBrowser).toHaveBeenCalledTimes(1);
        expect(logAutomationRun).toHaveBeenCalledWith(expect.objectContaining({ type: 'DHS_BULK_CHECK_STATUS', status: 'SUCCESS' }));
    });

    it('excludes caseIds outside the access-scoped set and reports them as forbidden, without calling the lookup route for them', async () => {
        // Only case-1 comes back from the access-scoped query — case-2 was requested but is not eligible.
        db.case.findMany.mockResolvedValue([
            { id: 'case-1', fileNumber: 'ZDM-001', status: 'REQUESTED_VIA_DHS', client: { idNumber: '8001015009087', firstName: 'Jane', lastName: 'Doe' } },
        ]);
        vi.mocked(dhsLookupPost).mockResolvedValue(okLookupResponse({ success: true, status: 'PENDING', message: 'Pending' }));
        db.case.findUnique.mockResolvedValue({ status: 'REQUESTED_VIA_DHS' });

        const res = await POST(makeReq({ caseIds: ['case-1', 'case-2'] }));
        const body = await res.json();

        expect(body.forbidden).toBe(1);
        expect(body.processed).toBe(1);
        expect(dhsLookupPost).toHaveBeenCalledTimes(1);
    });

    it('caps processing at 25 cases per run and reports the rest as skipped', async () => {
        const eligible = Array.from({ length: 30 }, (_, i) => ({
            id: `case-${i}`,
            fileNumber: `ZDM-${i}`,
            status: 'REQUESTED_VIA_DHS',
            client: { idNumber: '8001015009087', firstName: 'Jane', lastName: 'Doe' },
        }));
        db.case.findMany.mockResolvedValue(eligible);
        vi.mocked(dhsLookupPost).mockResolvedValue(okLookupResponse({ success: true, status: 'PENDING', message: 'Pending' }));
        db.case.findUnique.mockResolvedValue({ status: 'REQUESTED_VIA_DHS' });

        const res = await POST(makeReq({ caseIds: eligible.map(c => c.id) }));
        const body = await res.json();

        expect(body.processed).toBe(25);
        expect(body.skipped).toBe(5);
        expect(dhsLookupPost).toHaveBeenCalledTimes(25);
    });

    it('skips a case with no ID number on file without calling the lookup route, and counts it as an error', async () => {
        db.case.findMany.mockResolvedValue([
            { id: 'case-1', fileNumber: 'ZDM-001', status: 'REQUESTED_VIA_DHS', client: { idNumber: null, firstName: 'Jane', lastName: 'Doe' } },
        ]);

        const res = await POST(makeReq({ caseIds: ['case-1'] }));
        const body = await res.json();

        expect(dhsLookupPost).not.toHaveBeenCalled();
        expect(body.summary.errors).toBe(1);
        expect(body.results[0]).toMatchObject({ caseId: 'case-1', error: 'Missing ID number' });
    });

    it('records a per-case error when the lookup route itself returns an error, and continues to the next case', async () => {
        db.case.findMany.mockResolvedValue([
            { id: 'case-1', fileNumber: 'ZDM-001', status: 'REQUESTED_VIA_DHS', client: { idNumber: '8001015009087', firstName: 'Jane', lastName: 'Doe' } },
            { id: 'case-2', fileNumber: 'ZDM-002', status: 'REQUESTED_VIA_DHS', client: { idNumber: '8501015009087', firstName: 'John', lastName: 'Smith' } },
        ]);
        vi.mocked(dhsLookupPost)
            .mockResolvedValueOnce(NextResponse.json({ error: 'DHS check timed out after 90.00s. Please try again.' }, { status: 504 }))
            .mockResolvedValueOnce(okLookupResponse({ success: true, status: 'PENDING', message: 'Pending' }));
        db.case.findUnique.mockResolvedValueOnce({ status: 'REQUESTED_VIA_DHS' });

        const res = await POST(makeReq({ caseIds: ['case-1', 'case-2'] }));
        const body = await res.json();

        expect(body.summary.errors).toBe(1);
        expect(body.summary.pending).toBe(1);
        expect(body.results[0].error).toContain('timed out');
        expect(dhsLookupPost).toHaveBeenCalledTimes(2);
    });
});
