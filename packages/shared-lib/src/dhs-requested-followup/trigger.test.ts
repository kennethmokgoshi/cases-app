import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: { case: { findMany: vi.fn() } },
}));
vi.mock('../dhs', () => ({
    checkTransferStatus: vi.fn(),
    closeBrowser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../dhs/decline-handler', () => ({
    handleDHSDecline: vi.fn(),
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
import { runRequestedViaDhsFollowup, getRequestedViaDhsCohort, COHORT_STATUS, FLAG_REMOVAL_SERVICE } from './trigger';

const findMany = prisma.case.findMany as unknown as ReturnType<typeof vi.fn>;

function cohortRow(id: string, fileNumber: string) {
    return { id, fileNumber, client: { firstName: 'A', lastName: 'B', idNumber: '8001015009087' } };
}

beforeEach(() => vi.clearAllMocks());

describe('getRequestedViaDhsCohort', () => {
    it('filters on overdue + flag removal + REQUESTED_VIA_DHS (never DHS_REQUESTED)', async () => {
        findMany.mockResolvedValue([]);
        await getRequestedViaDhsCohort();
        const where = findMany.mock.calls[0][0].where;
        expect(where.isOverdue).toBe(true);
        expect(where.deletedAt).toBeNull();
        expect(where.status).toBe('REQUESTED_VIA_DHS');
        expect(where.status).not.toBe('DHS_REQUESTED');
        expect(where.services).toEqual({ contains: FLAG_REMOVAL_SERVICE });
        expect(COHORT_STATUS).toBe('REQUESTED_VIA_DHS');
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

    it('DECLINED → invokes handleDHSDecline with the decline reason', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
            found: true, status: 'DECLINED', declineReason: 'Please send POA and ID',
        });
        (handleDHSDecline as ReturnType<typeof vi.fn>).mockResolvedValue({
            category: 'SEND_DOCS', statusUpdatedTo: 'DOCUMENTS_EMAILED', actionsPerformed: ['emailed'], errors: [],
        });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(handleDHSDecline).toHaveBeenCalledWith({
            caseId: 'c1', declineReason: 'Please send POA and ID', triggeredByUserId: 'admin1',
        });
        expect(res.stats.declined).toBe(1);
    });

    it('PENDING → bumps nextUpdate and adds a comment', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ found: true, status: 'PENDING', daysCounter: '2 Day(s)' });

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(setNextUpdate).toHaveBeenCalledWith('c1', 3, 'admin1');
        expect(addSystemComment).toHaveBeenCalled();
        expect(res.stats.stillPending).toBe(1);
    });

    it('DHS timeout → counts an error and does not change status', async () => {
        findMany.mockResolvedValue([cohortRow('c1', 'ZDM-1')]);
        (checkTransferStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const res = await runRequestedViaDhsFollowup({ dryRun: false });

        expect(res.stats.errors).toBe(1);
        expect(updateCaseStatus).not.toHaveBeenCalled();
    });
});
