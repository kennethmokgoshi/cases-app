import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@/lib/referrer-portal-access', () => ({
    getCurrentReferrerPortalAccess: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findFirst: vi.fn() },
        caseComment: { findMany: vi.fn(), create: vi.fn() },
        inAppNotification: { create: vi.fn() },
    },
}));

import { prisma } from '@zenowethu/database';
import { touchCaseAction } from '@zenowethu/shared-lib';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { POST } from './route';

function post(caseId: string, body: unknown) {
    return POST(
        new Request(`http://localhost/api/referrer-portal/referrals/${caseId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ caseId }) },
    );
}

const access = {
    ok: true as const,
    sessionUserId: 'user-1',
    referrer: { id: 'ref-1', firstName: 'William', lastName: 'Maesela' },
};

describe('POST /api/referrer-portal/referrals/[caseId]/comments', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects an empty message', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce(access);

        const res = await post('case-1', { message: ' ' });

        expect(res.status).toBe(422);
        expect(prisma.caseComment.create).not.toHaveBeenCalled();
    });

    it('rejects a case not linked to the current referrer', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce(access);
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce(null);

        const res = await post('case-2', { message: 'Any update on this client?' });

        expect(res.status).toBe(404);
        expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'case-2', referrerId: 'ref-1', deletedAt: null },
        }));
    });

    it('creates a referrer-thread comment and notifies the assigned case manager', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce(access);
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM-2026-1020-43Z',
            assignedToId: 'staff-1',
        } as never);
        vi.mocked(prisma.caseComment.create).mockResolvedValueOnce({
            id: 'comment-1',
            content: 'Any update on this client?',
            createdAt: new Date('2026-07-13T09:00:00Z'),
            user: { firstName: 'William', lastName: 'Maesela', userType: 'REFERRER' },
        } as never);
        vi.mocked(prisma.inAppNotification.create).mockResolvedValueOnce({} as never);

        const res = await post('case-1', { message: 'Any update on this client?' });
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.comment).toEqual(expect.objectContaining({
            id: 'comment-1',
            fromReferrer: true,
            authorName: 'William',
        }));
        expect(prisma.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                caseId: 'case-1',
                userId: 'user-1',
                type: 'REFERRER',
                isInternal: false,
                activityType: 'REFERRER_COMMENT',
            }),
        }));
        expect(touchCaseAction).toHaveBeenCalledWith('case-1', 'COMMENT', { userId: 'user-1' });
        expect(prisma.inAppNotification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'staff-1',
                type: 'REFERRER_COMMENT',
                caseId: 'case-1',
                commentId: 'comment-1',
            }),
        }));
    });

    it('skips the notification when the case has no assignee', async () => {
        vi.mocked(getCurrentReferrerPortalAccess).mockResolvedValueOnce(access);
        vi.mocked(prisma.case.findFirst).mockResolvedValueOnce({
            id: 'case-1',
            fileNumber: 'ZDM-2026-1020-43Z',
            assignedToId: null,
        } as never);
        vi.mocked(prisma.caseComment.create).mockResolvedValueOnce({
            id: 'comment-1',
            content: 'Any update on this client?',
            createdAt: new Date('2026-07-13T09:00:00Z'),
            user: { firstName: 'William', lastName: 'Maesela', userType: 'REFERRER' },
        } as never);

        const res = await post('case-1', { message: 'Any update on this client?' });

        expect(res.status).toBe(201);
        expect(prisma.inAppNotification.create).not.toHaveBeenCalled();
    });
});
