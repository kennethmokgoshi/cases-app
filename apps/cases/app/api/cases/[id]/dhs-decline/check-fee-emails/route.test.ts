import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findUnique: vi.fn(),
        },
        caseComment: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        workflowLog: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { POST } from './route';

type PrismaMock = {
    case: {
        findUnique: ReturnType<typeof vi.fn>;
    };
    caseComment: {
        findFirst: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
    };
    workflowLog: {
        create: ReturnType<typeof vi.fn>;
    };
};

const db = prisma as unknown as PrismaMock;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown> = {}): Request {
    return new Request('https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

const params = { params: Promise.resolve({ id: 'case-1' }) };

describe('POST /api/cases/[id]/dhs-decline/check-fee-emails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.DC_FEE_INBOX_PROVIDER;
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        db.case.findUnique.mockResolvedValue({
            id: 'case-1',
            fileNumber: 'ZEN-001',
            status: 'REJECTED_OWES_FEES',
            declineReason: 'Consumer owes fees',
            client: {
                firstName: 'Mfuneko',
                lastName: 'Lubenye',
                idNumber: '8912015638081',
                email: 'mfuneko@example.com',
            },
        });
        db.caseComment.findFirst.mockResolvedValue(null);
        db.caseComment.create.mockResolvedValue({ id: 'comment-1' });
        db.workflowLog.create.mockResolvedValue({ id: 'workflow-1' });
    });

    it('logs a fee-invoice email check request for staff users', async () => {
        process.env.DC_FEE_INBOX_PROVIDER = 'imap';

        const response = await POST(
            request({ lookbackDays: 120, receivedAfter: '2026-05-11T00:00:00.000Z', reason: 'Fees owed' }),
            params
        );
        const body = await response.json();

        expect(response.status).toBe(202);
        expect(body.success).toBe(true);
        expect(body.scanQueued).toBe(true);
        expect(body.inboxConfigured).toBe(true);
        expect(db.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-1',
                userId: 'staff-1',
                activityType: 'DHS_FEE_EMAIL_SCAN_REQUESTED',
                content: expect.stringContaining('8912015638081'),
            }),
        }));
        expect(db.workflowLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-1',
                action: 'DHS_FEE_EMAIL_SCAN_REQUESTED',
            }),
        }));
    });

    it('does not create another request when one already exists in the 24-hour window', async () => {
        db.caseComment.findFirst.mockResolvedValue({
            id: 'existing-comment',
            createdAt: new Date('2026-07-09T10:00:00.000Z'),
        });

        const response = await POST(request({ lookbackDays: 90 }), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.duplicate).toBe(true);
        expect(body.scanQueued).toBe(false);
        expect(body.activityId).toBe('existing-comment');
        expect(db.caseComment.create).not.toHaveBeenCalled();
        expect(db.workflowLog.create).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated and partner users', async () => {
        mockedAuth.mockResolvedValueOnce(null);
        expect((await POST(request(), params)).status).toBe(401);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'partner-1', userType: 'B2B_PARTNER' } });
        expect((await POST(request(), params)).status).toBe(403);
    });

    it('returns 404 when the case does not exist', async () => {
        db.case.findUnique.mockResolvedValue(null);

        const response = await POST(request(), params);

        expect(response.status).toBe(404);
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });

    it('returns 400 for malformed JSON', async () => {
        const response = await POST(
            new Request('https://cases.zenowethu.co.za/api/cases/case-1/dhs-decline/check-fee-emails', {
                method: 'POST',
                body: '{not-json',
            }),
            params
        );

        expect(response.status).toBe(400);
        expect(db.case.findUnique).not.toHaveBeenCalled();
    });
});
