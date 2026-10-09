import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findMany: vi.fn(), findUnique: vi.fn() },
        user: { findMany: vi.fn() },
        caseComment: { findFirst: vi.fn(), create: vi.fn() },
        inAppNotification: { createMany: vi.fn() },
    },
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { getAutomationUserId } from '../automation/automation-user';
import {
    runDebtReviewRemovalTrigger,
    assessmentFingerprint,
    wasRecentlyReported,
} from './trigger';
import { PATH_A_TO_B } from './removal-paths';
import type { RemovalAssessment } from './removal-paths';

const db = prisma as unknown as {
    case: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn> };
    caseComment: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    inAppNotification: { createMany: ReturnType<typeof vi.fn> };
};

function caseRecord(consumerDhsStatus: string, docTypes: string[] = [], todos = '') {
    return {
        id: 'case-1',
        fileNumber: 'ZDM-001',
        consumerDhsStatus,
        todos,
        client: { firstName: 'Thandi', lastName: 'Nkosi', phone: null, email: null },
        documents: docTypes.map(type => ({ type, uploadedAt: new Date() })),
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAutomationUserId).mockResolvedValue('auto-1');
    db.case.findMany.mockResolvedValue([{ id: 'case-1', fileNumber: 'ZDM-001', consumerDhsStatus: 'F2' }]);
    db.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'mgr-1' }]);
    db.caseComment.findFirst.mockResolvedValue(null);
    db.caseComment.create.mockResolvedValue({});
    db.inAppNotification.createMany.mockResolvedValue({ count: 2 });
});

describe('runDebtReviewRemovalTrigger', () => {
    it('notifies every staff target once when a case is already exitable (PROCEED)', async () => {
        db.case.findUnique.mockResolvedValue(caseRecord('F2'));

        const result = await runDebtReviewRemovalTrigger();

        expect(result.readyForRemoval).toBe(1);
        expect(result.errors).toBe(0);
        expect(db.inAppNotification.createMany).toHaveBeenCalledTimes(1);
        const { data } = db.inAppNotification.createMany.mock.calls[0]![0];
        expect(data.map((d: { userId: string }) => d.userId)).toEqual(['admin-1', 'mgr-1']);
        expect(data[0].title).toContain('Ready for DHS Removal');
    });

    it('queries staff without non-existent User columns and excludes locked accounts', async () => {
        db.case.findUnique.mockResolvedValue(caseRecord('F2'));

        await runDebtReviewRemovalTrigger();

        const where = db.user.findMany.mock.calls[0]![0].where;
        expect(where).not.toHaveProperty('deletedAt');
        expect(where).toMatchObject({ userType: 'STAFF', isLocked: false });
    });

    it('stamps the system comment with the automation user and a fingerprint', async () => {
        db.case.findUnique.mockResolvedValue(caseRecord('F2'));

        await runDebtReviewRemovalTrigger();

        const data = db.caseComment.create.mock.calls[0]![0].data;
        expect(data.userId).toBe('auto-1');
        expect(JSON.parse(data.activityData).fingerprint).toMatch(/^PROCEED\|/);
    });

    it('does not re-notify when the same outcome was already reported inside the cooldown', async () => {
        db.case.findUnique.mockResolvedValue(caseRecord('F2'));
        const first = await runDebtReviewRemovalTrigger();
        const fingerprint = assessmentFingerprint(first.assessments[0]!);

        vi.clearAllMocks();
        db.case.findMany.mockResolvedValue([{ id: 'case-1', fileNumber: 'ZDM-001', consumerDhsStatus: 'F2' }]);
        db.case.findUnique.mockResolvedValue(caseRecord('F2'));
        db.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);
        db.caseComment.findFirst.mockResolvedValue({ activityData: JSON.stringify({ fingerprint }) });

        const second = await runDebtReviewRemovalTrigger();

        expect(second.skippedRecent).toBe(1);
        expect(second.readyForRemoval).toBe(0);
        expect(db.inAppNotification.createMany).not.toHaveBeenCalled();
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });

    it('does notify again when the outcome changed since the last report', async () => {
        db.case.findUnique.mockResolvedValue(caseRecord('F2'));
        db.caseComment.findFirst.mockResolvedValue({
            activityData: JSON.stringify({ fingerprint: 'REQUEST_DOCS|A>B|FORM_16' }),
        });

        const result = await runDebtReviewRemovalTrigger();

        expect(result.skippedRecent).toBe(0);
        expect(result.readyForRemoval).toBe(1);
        expect(db.inAppNotification.createMany).toHaveBeenCalledTimes(1);
    });

    it('sends ONE staff notification when documents are missing', async () => {
        db.case.findMany.mockResolvedValue([{ id: 'case-1', fileNumber: 'ZDM-001', consumerDhsStatus: 'A' }]);
        db.case.findUnique.mockResolvedValue(caseRecord('A'));

        const result = await runDebtReviewRemovalTrigger();

        expect(result.needsDocs).toBe(1);
        expect(db.inAppNotification.createMany).toHaveBeenCalledTimes(1);
        const { data } = db.inAppNotification.createMany.mock.calls[0]![0];
        expect(data[0].title).toContain('documents needed');
        expect(data[0].title).not.toContain('Docs Present');
        expect(data[0].message).toContain('Debt Counsellor to prepare');
    });

    it('escalates a D4 case with no evidence of its exit path', async () => {
        db.case.findMany.mockResolvedValue([{ id: 'case-1', fileNumber: 'ZDM-001', consumerDhsStatus: 'D4' }]);
        db.case.findUnique.mockResolvedValue(caseRecord('D4'));

        const result = await runDebtReviewRemovalTrigger();

        expect(result.escalated).toBe(1);
        const { data } = db.inAppNotification.createMany.mock.calls[0]![0];
        expect(data[0].title).toContain('Manual Review Required');
    });

    it('takes no action when the consumer has no DHS status path', async () => {
        db.case.findMany.mockResolvedValue([{ id: 'case-1', fileNumber: 'ZDM-001', consumerDhsStatus: 'ZZ' }]);
        db.case.findUnique.mockResolvedValue(caseRecord('ZZ'));

        const result = await runDebtReviewRemovalTrigger();

        expect(result.noAction).toBe(1);
        expect(db.inAppNotification.createMany).not.toHaveBeenCalled();
    });

    it('counts a failing case as an error and keeps scanning the rest', async () => {
        db.case.findMany.mockResolvedValue([
            { id: 'bad', fileNumber: 'ZDM-BAD', consumerDhsStatus: 'F2' },
            { id: 'case-1', fileNumber: 'ZDM-001', consumerDhsStatus: 'F2' },
        ]);
        db.case.findUnique
            .mockRejectedValueOnce(new Error('db down'))
            .mockResolvedValueOnce(caseRecord('F2'));

        const result = await runDebtReviewRemovalTrigger();

        expect(result.errors).toBe(1);
        expect(result.readyForRemoval).toBe(1);
    });
});

describe('wasRecentlyReported', () => {
    const assessment = {
        caseId: 'case-1',
        fileNumber: 'ZDM-001',
        action: 'REQUEST_DOCS',
        recommendedPath: PATH_A_TO_B,
        missingDocTypes: ['FORM_16', 'FORM_17_2A'],
    } as unknown as RemovalAssessment;

    it('fails open (returns false) when the lookup throws', async () => {
        db.caseComment.findFirst.mockRejectedValue(new Error('db down'));
        await expect(wasRecentlyReported(assessment)).resolves.toBe(false);
    });

    it('ignores the order of missing documents in the fingerprint', () => {
        const reordered = { ...assessment, missingDocTypes: ['FORM_17_2A', 'FORM_16'] } as RemovalAssessment;
        expect(assessmentFingerprint(reordered)).toBe(assessmentFingerprint(assessment));
    });
});
