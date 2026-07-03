import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib/src/dhs/accepted-handler', () => ({
    handleDhsAccepted: vi.fn(),
    isManageConsumersEligible: vi.fn(),
}));

import { POST } from './route';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { prisma } from '@zenowethu/database';
import { handleDhsAccepted, isManageConsumersEligible } from '@zenowethu/shared-lib/src/dhs/accepted-handler';

const db = prisma as unknown as { case: { findUnique: ReturnType<typeof vi.fn> } };
const handler = handleDhsAccepted as unknown as ReturnType<typeof vi.fn>;
const eligible = isManageConsumersEligible as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ id: 'case1' });
const request = () =>
    new NextRequest('https://app.zenowethu.co.za/api/cases/case1/resend-consent', { method: 'POST' });

const okResult = {
    emailSent: true,
    skipped: false,
    consentLink: 'https://credo.zenowethu.co.za/consent/tok123',
    statusUpdatedTo: 'READY_TO_CONSENT',
    actionsPerformed: [],
    errors: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', userType: 'STAFF' } } as never);
    db.case.findUnique.mockResolvedValue({
        id: 'case1',
        status: 'READY_TO_CONSENT',
        dhsStatus: 'Accepted',
        manuallyAcceptedViaDhs: false,
    });
    eligible.mockReturnValue(true);
    handler.mockResolvedValue(okResult);
});

describe('POST /api/cases/[id]/resend-consent', () => {
    it('re-sends the confirmation link with forceResend, attributed to the staff member', async () => {
        const res = await POST(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.emailSent).toBe(true);
        expect(json.message).toContain('re-sent');
        expect(handler).toHaveBeenCalledWith({
            caseId: 'case1',
            triggeredByUserId: 'staff1',
            forceResend: true,
        });
    });

    it('reports "already confirmed" without sending when the consumer has consented', async () => {
        handler.mockResolvedValue({
            ...okResult,
            emailSent: false,
            skipped: true,
            reason: 'Consumer has already consented',
        });

        const res = await POST(request(), { params });
        const json = await res.json();

        expect(json.success).toBe(true);
        expect(json.alreadyConsented).toBe(true);
        expect(json.message).toContain('already confirmed');
    });

    it('refuses when the file is not Accepted via DHS', async () => {
        eligible.mockReturnValue(false);

        const res = await POST(request(), { params });
        const json = await res.json();

        expect(json.success).toBe(false);
        expect(json.message).toContain('Accepted via DHS');
        expect(handler).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated and B2B partner callers', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        expect((await POST(request(), { params })).status).toBe(401);

        vi.mocked(auth).mockResolvedValue({ user: { id: 'p1', userType: 'B2B_PARTNER' } } as never);
        expect((await POST(request(), { params })).status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown case', async () => {
        db.case.findUnique.mockResolvedValue(null);
        expect((await POST(request(), { params })).status).toBe(404);
    });

    it('surfaces handler errors as a failed resend', async () => {
        handler.mockResolvedValue({ ...okResult, emailSent: false, errors: ['SMTP refused'] });

        const res = await POST(request(), { params });
        const json = await res.json();

        expect(json.success).toBe(false);
        expect(json.message).toContain('SMTP refused');
    });
});
