import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    sendManualMessage: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    touchCaseAction: vi.fn(),
}));

vi.mock('@/lib/b2b-case-access', () => ({
    canB2BAccessCase: vi.fn(),
    getMentionableUsersForB2B: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        caseComment: { findMany: vi.fn(), create: vi.fn() },
        workflowLog: { findMany: vi.fn() },
        case: { findUnique: vi.fn() },
        user: { findMany: vi.fn(), findUnique: vi.fn() },
        userGroup: { findMany: vi.fn() },
        inAppNotification: { create: vi.fn() },
    },
}));

import { GET, POST } from './route';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { canB2BAccessCase, getMentionableUsersForB2B } from '@/lib/b2b-case-access';

const db = prisma as unknown as {
    caseComment: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    workflowLog: { findMany: ReturnType<typeof vi.fn> };
    case: { findUnique: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    userGroup: { findMany: ReturnType<typeof vi.fn> };
    inAppNotification: { create: ReturnType<typeof vi.fn> };
};

const params = Promise.resolve({ id: 'case-1' });
const getReq = () => new Request('https://app.zenowethu.co.za/api/cases/case-1/comments');
const postReq = (body: unknown) => new Request('https://app.zenowethu.co.za/api/cases/case-1/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

beforeEach(() => {
    vi.clearAllMocks();
    db.workflowLog.findMany.mockResolvedValue([]);
});

describe('GET /api/cases/[id]/comments', () => {
    it('rejects unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);

        const res = await GET(getReq(), { params });

        expect(res.status).toBe(401);
        expect(db.caseComment.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 for a B2B partner outside the case hierarchy', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(false);

        const res = await GET(getReq(), { params });

        expect(res.status).toBe(404);
        expect(db.caseComment.findMany).not.toHaveBeenCalled();
    });

    it('hides internal comments from B2B partners', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(true);
        db.caseComment.findMany.mockResolvedValue([]);

        await GET(getReq(), { params });

        expect(db.caseComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { caseId: 'case-1', isInternal: false },
        }));
    });

    it('returns internal and non-internal comments for staff', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } } as never);
        db.caseComment.findMany.mockResolvedValue([]);

        await GET(getReq(), { params });

        expect(db.caseComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { caseId: 'case-1' },
        }));
    });
});

describe('POST /api/cases/[id]/comments', () => {
    const commentRecord = {
        id: 'comment-1',
        user: { id: 'author', firstName: 'A', lastName: 'B', email: 'a@b.co.za' },
        mentions: [],
    };

    beforeEach(() => {
        db.case.findUnique.mockResolvedValue({ id: 'case-1', fileNumber: 'ZDM-1' });
        db.caseComment.create.mockResolvedValue(commentRecord as never);
        db.user.findUnique.mockResolvedValue({ firstName: 'A', lastName: 'B' } as never);
    });

    it('rejects a B2B partner outside the case hierarchy', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(false);

        const res = await POST(postReq({ content: 'Hello' }), { params });

        expect(res.status).toBe(404);
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });

    it('forces isInternal to false for B2B-authored comments even if the client requests internal', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(true);
        vi.mocked(getMentionableUsersForB2B).mockResolvedValue([]);

        await POST(postReq({ content: 'Hello', isInternal: true }), { params });

        expect(db.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ isInternal: false }),
        }));
    });

    it('restricts B2B @mentions to the scoped candidate list, not the full userbase', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'p-1', userType: 'B2B_PARTNER', b2bPartnerId: 'partner-1' } } as never);
        vi.mocked(canB2BAccessCase).mockResolvedValue(true);
        vi.mocked(getMentionableUsersForB2B).mockResolvedValue([
            { id: 'staff-1', email: 'jane@zenowethu.co.za', firstName: 'Jane', lastName: 'Doe', username: 'jane.doe', userType: 'STAFF', emailNotificationsEnabled: true },
        ] as never);

        await POST(postReq({ content: 'Hi @JaneDoe please check this' }), { params });

        expect(db.user.findMany).not.toHaveBeenCalled();
        expect(db.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                mentions: { create: [{ userId: 'staff-1' }] },
            }),
        }));
        expect(db.inAppNotification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ userId: 'staff-1', type: 'MENTION', linkUrl: '/cases/case-1' }),
        }));
    });

    it('sends B2B-partner mention notifications to the partner portal, not the staff route', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } } as never);
        db.user.findMany.mockResolvedValue([
            { id: 'partner-1', email: 'p@partner.co.za', firstName: 'Sam', lastName: 'Partner', username: 'sam.p', userType: 'B2B_PARTNER', emailNotificationsEnabled: true },
        ] as never);
        db.userGroup.findMany.mockResolvedValue([]);

        await POST(postReq({ content: 'Hi @SamPartner' }), { params });

        expect(db.inAppNotification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ userId: 'partner-1', linkUrl: '/b2b-dashboard/cases/case-1' }),
        }));
    });
});
