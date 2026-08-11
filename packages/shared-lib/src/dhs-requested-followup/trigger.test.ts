import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findMany: vi.fn(), findUnique: vi.fn() },
        caseComment: { findFirst: vi.fn(), create: vi.fn() },
        user: { findMany: vi.fn() },
        inAppNotification: { createMany: vi.fn() },
    },
}));
vi.mock('../dhs', () => ({
    checkTransferStatus: vi.fn(),
    closeBrowser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../dhs/decline-handler', () => ({
    handleDHSDecline: vi.fn(),
    classifyDeclineReason: vi.fn().mockReturnValue('SEND_DOCS'),
}));
vi.mock('../dhs/decline-preview', () => ({
    previewDHSDecline: vi.fn(),
}));
vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('admin1'),
}));
vi.mock('../automation/workflow-engine', () => ({
    updateCaseStatus: vi.fn().mockResolvedValue(undefined),
    setNextUpdate: vi.fn().mockResolvedValue(undefined),
    addSystemComment: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@zenowethu/database';
import { checkTransferStatus } from '../dhs';
import { handleDHSDecline } from '../dhs/decline-handler';
import { previewDHSDecline } from '../dhs/decline-preview';
import { updateCaseStatus, setNextUpdate, addSystemComment } from '../automation/workflow-engine';
import {
    runRequestedViaDhsFollowup,
    getRequestedViaDhsCohort,
    COHORT_STATUSES,
    FALLBACK_OVERDUE_DAYS,
    FLAG_REMOVAL_SERVICE,
    DECLINE_REVIEW_MARKER,
    DEFAULT_DECLINE_MODE,
} from './trigger';

const findMany = prisma.case.findMany as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
    case: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    caseComment: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn> };
    inAppNotification: { createMany: ReturnType<typeof vi.fn> };
};

function cohortRow(id: string, fileNumber: string, status = 'REQUESTED_VIA_DHS') {
    return { id, fileNumber, status, client: { firstName: 'A', lastName: 'B', idNumber: '8001015009087' } };
}

beforeEach(() => {
    vi.clearAllMocks();
    db.caseComment.findFirst.mockResolvedValue(null);
    db.caseComment.create.mockResolvedValue({});
    db.case.findUnique.mockResolvedValue({ assignedToId: 'staff1' });
    db.user.findMany.mockResolvedValue([{ id: 'admin1' }]);
    db.inAppNotification.createMany.mockResolvedValue({ count: 2 });
});

describe('getRequestedViaDhsCohort', () => {
    it('covers BOTH requested-via-DHS statuses and every service by default', async () => {
        findMany.mockResolvedValue([]);
        await getRequestedViaDhsCohort();
        const where = findMany.mock.calls[0][0].where;
        expect(where.deletedAt).toBeNull();
        expect(where.status).toEqual({ in: ['REQUESTED_VIA_DHS', 'DHS_REQUESTED'] });
        // No service filter — "all files requested via DHS", not just flag removal.
        expect(where.services).toBeUndefined();
        expect([...COHORT_STATUSES]).toEqual(['REQUESTED_VIA_DHS', 'DHS_REQUESTED']);
    });

    it('defaults to the safe decline mode — sending must be opted into', async () => {
        expect(DEFAULT_DECLINE_MODE).toBe('review');
    });

    it('treats overdue three ways so DHS_REQUESTED (no SLA, never flagged) is still caught', async () => {
        findMany.mockResolvedValue([]);
        await getRequestedViaDhsCohort();
        const where = findMany.mock.calls[0][0].where;

        expect(where.OR).toHaveLength(3);
        expect(where.OR[0]).toEqual({ isOverdue: true });
        expect(where.OR[1].nextUpdate.lt).toBeInstanceOf(Date);

        const cutoff: Date = where.OR[2].statusEntryDate.lt;
        const daysBack = Math.round((Date.now() - cutoff.getTime()) / 86_400_000);
        expect(daysBack).toBe(FALLBACK_OVERDUE_DAYS);
    });

    it('still supports narrowing to one status, one service, and a custom window', async () => {
        findMany.mockResolvedValue([]);
        await getRequestedViaDhsCohort({
            statuses: ['REQUESTED_VIA_DHS'],
            service: FLAG_REMOVAL_SERVICE,
            overdueDays: 30,
            limit: 5,
        });
        const call = findMany.mock.calls[0][0];

        expect(call.where.status).toEqual({ in: ['REQUESTED_VIA_DHS'] });
        expect(call.where.services).toEqual({ contains: FLAG_REMOVAL_SERVICE });
        expect(call.take).toBe(5);

        const cutoff: Date = call.where.OR[2].statusEntryDate.lt;
        expect(Math.round((Date.now() - cutoff.getTime()) / 86_400_000)).toBe(30);
    });
});

describe('runRequestedViaDhsFollowup — dry run', () => {
    it('renders previews and performs NO live DHS check, sends, or writes', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1'), cohortRow('c2', 'ZDM-2')]);
        (previewDHSDecline as ReturnType<typeof vi.fn>).mockResolvedValue({
            caseId: 'c1', fileNumber: 'ZDM-1', declineReason: 'x', category: 'SEND_DOCS',
            statusWouldUpdateTo: 'DOCUMENTS_EMAILED', extractedEmail: null, messages: [], notes: [],
        });

        const res = await runRequestedViaDhsFollowup({ dryRun: true });

        expect(res.dryRun).toBe(true);
        expect(res.cohortCount).toBe(2);
        expect(res.stats.previewed).toBe(2);
        expect(previewDHSDecline).toHaveBeenCalledTimes(2);
        expect(checkTransferStatus).not.toHaveBeenCalled();
        expect(handleDHSDecline).not.toHaveBeenCalled();
        expect(updateCaseStatus).not.toHaveBeenCalled();
        expect(setNextUpdate).not.toHaveBeenCalled();
        expect(addSystemComment).not.toHaveBeenCalled();
    });
});

describe('runRequestedViaDhsFollowup — live routing', () => {
    it('ACCEPTED → updates status to ACCEPTED_VIA_DHS', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ found: true, status: 'ACCEPTED' });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(updateCaseStatus).toHaveBeenCalledWith('c1', 'ACCEPTED_VIA_DHS', 'admin1');
        expect(res.stats.accepted).toBe(1);
        expect(handleDHSDecline).not.toHaveBeenCalled();
    });

    it('DECLINED with declineMode=auto → invokes handleDHSDecline with the decline reason', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            found: true, status: 'DECLINED', declineReason: 'Please send POA and ID',
        });
        (handleDHSDecline as ReturnType<typeof vi.fn>).mockResolvedValue({
            category: 'SEND_DOCS', statusUpdatedTo: 'DOCUMENTS_EMAILED', actionsPerformed: ['emailed'], errors: [],
        });

        const res = await runRequestedViaDhsFollowup({ dryRun: false, declineMode: 'auto' });

        expect(handleDHSDecline).toHaveBeenCalledWith({
            caseId: 'c1', declineReason: 'Please send POA and ID', triggeredByUserId: 'admin1',
        });
        expect(res.stats.declined).toBe(1);
        expect(res.stats.declinedForReview).toBe(0);
    });

    it('PENDING → bumps nextUpdate and adds a comment', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ found: true, status: 'PENDING', daysCounter: '2 Day(s)' });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(setNextUpdate).toHaveBeenCalledWith('c1', 3, 'admin1');
        expect(addSystemComment).toHaveBeenCalled();
        expect(res.stats.stillPending).toBe(1);
    });

    it('processes DHS_REQUESTED files too, reporting the status they came from', async () => {
        findMany.mockResolvedValue([
            cohortRow('c1', 'ZDM-1', 'REQUESTED_VIA_DHS'),
            cohortRow('c2', 'ZDM-2', 'DHS_REQUESTED'),
        ]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ found: true, status: 'ACCEPTED' });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(res.stats.accepted).toBe(2);
        expect(updateCaseStatus).toHaveBeenCalledWith('c2', 'ACCEPTED_VIA_DHS', 'admin1');
        expect(res.files.map(f => f.previousStatus)).toEqual(['REQUESTED_VIA_DHS', 'DHS_REQUESTED']);
        expect(res.cohortStatuses).toEqual(['REQUESTED_VIA_DHS', 'DHS_REQUESTED']);
        expect(res.cohortService).toBeNull();
    });

    it('DECLINED defaults to review mode — classifies and flags staff, sends NOTHING', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            found: true, status: 'DECLINED', declineReason: 'Please send POA and ID',
        });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        // The whole point: no outbound messages, no status change.
        expect(handleDHSDecline).not.toHaveBeenCalled();
        expect(updateCaseStatus).not.toHaveBeenCalled();

        expect(res.declineMode).toBe('review');
        expect(res.stats.declinedForReview).toBe(1);
        expect(res.stats.declined).toBe(0);
        expect(res.files[0].outcome).toBe('DECLINED_REVIEW');

        // Recorded on the case with the marker, and staff notified.
        const comment = db.caseComment.create.mock.calls[0][0].data.content;
        expect(comment).toContain(DECLINE_REVIEW_MARKER);
        expect(comment).toContain('Please send POA and ID');
        expect(comment).toContain('NOTHING has been sent');

        const notified = db.inAppNotification.createMany.mock.calls[0][0].data;
        expect(notified.map((n: { userId: string }) => n.userId).sort()).toEqual(['admin1', 'staff1']);
        expect(notified[0].type).toBe('DHS_DECLINE_REVIEW');
    });

    it('a file already flagged for review is skipped without burning a DHS check', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        db.caseComment.findFirst.mockResolvedValue({ id: 'prior-review' });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(checkTransferStatus).not.toHaveBeenCalled();
        expect(db.inAppNotification.createMany).not.toHaveBeenCalled();
        expect(res.stats.skippedAwaitingReview).toBe(1);
        expect(res.files[0].outcome).toBe('SKIPPED_AWAITING_REVIEW');
    });

    it('declineMode=auto ignores the review flag and still actions the decline', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        db.caseComment.findFirst.mockResolvedValue({ id: 'prior-review' });
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            found: true, status: 'DECLINED', declineReason: 'Outstanding fees',
        });
        (handleDHSDecline as ReturnType<typeof vi.fn>).mockResolvedValue({
            category: 'OUTSTANDING_FEES', statusUpdatedTo: 'REJECTED_OWES_FEES', actionsPerformed: [], errors: [],
        });

        const res = await runRequestedViaDhsFollowup({ dryRun: false, declineMode: 'auto' });

        expect(checkTransferStatus).toHaveBeenCalled();
        expect(handleDHSDecline).toHaveBeenCalled();
        expect(res.stats.skippedAwaitingReview).toBe(0);
    });

    it('a review-flag lookup failure is non-fatal — the file is still checked', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        db.caseComment.findFirst.mockRejectedValue(new Error('db down'));
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ found: true, status: 'ACCEPTED' });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(res.stats.accepted).toBe(1);
        expect(res.stats.errors).toBe(0);
    });

    it('DHS timeout → counts an error and does not change status', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(res.stats.errors).toBe(1);
        expect(updateCaseStatus).not.toHaveBeenCalled();
    });
});
