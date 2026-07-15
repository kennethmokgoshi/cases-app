import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@zenowethu/database';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { POST } from './route';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
        inAppNotification: {
            create: vi.fn(),
        },
    },
}));

function req() {
    return new Request('http://localhost/api/referrer-portal/referrals/case-123/feedback-request', {
        method: 'POST',
    });
}

describe('POST /api/referrer-portal/referrals/[caseId]/feedback-request', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates feedback request comment and staff notification', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce({
            ok: true,
            sessionUserId: 'user-1',
            referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
        });

        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-123',
            fileNumber: 'ZDM-123',
            assignedToId: 'staff-1',
        } as never);

        vi.mocked(prisma.caseComment.create).mockResolvedValueOnce({
            id: 'comment-1',
            content: 'feedback request',
            createdAt: new Date(),
            user: { firstName: 'William', lastName: 'Maesela', userType: 'REFERRER' },
        } as never);

        vi.mocked(prisma.inAppNotification.create).mockResolvedValueOnce({} as never);

        const res = await POST(req(), { params: Promise.resolve({ caseId: 'case-123' }) });
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(prisma.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-123',
                content: expect.stringContaining('[FEEDBACK REQUEST]'),
            }),
        }));
        expect(prisma.inAppNotification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'staff-1',
                type: 'REFERRER_FEEDBACK_REQUEST',
            }),
        }));
    });
});
