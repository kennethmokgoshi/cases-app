import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user'),
}));

vi.mock('./status-history', () => ({
    getConsumerStatusHistory: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { getConsumerStatusHistory } from './status-history';
import { runManageConsumersClearance } from './clearance-automation';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    caseComment: { create: ReturnType<typeof vi.fn> };
};
const history = getConsumerStatusHistory as unknown as ReturnType<typeof vi.fn>;

const caseRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'case1',
    status: 'CONSENT_RECEIVED',
    client: { idNumber: '8001015009087', firstName: 'Sipho', lastName: 'Dlamini' },
    ...overrides,
});

const evaluation = (overrides: Record<string, unknown> = {}) => ({
    eligible: false,
    currentCode: null,
    matchedDescription: null,
    statusDate: null,
    daysSinceStatus: null,
    workflowStatus: null,
    notes: [],
    entries: [],
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    db.case.update.mockResolvedValue({});
    db.caseComment.create.mockResolvedValue({});
});

describe('runManageConsumersClearance', () => {
    it('moves the case to READY_CLEARANCE when DHS shows a recent clearance-eligible code', async () => {
        db.case.findUnique.mockResolvedValue(caseRow());
        history.mockResolvedValue({
            found: true,
            idNumber: '8001015009087',
            message: 'ok',
            evaluation: evaluation({
                eligible: true,
                currentCode: 'G',
                workflowStatus: 'READY_CLEARANCE',
                daysSinceStatus: 2,
                notes: ['Clearance-eligible code "G" dated 2026-07-02 (2 calendar day(s) ago) → Ready for Clearance.'],
            }),
        });

        const r = await runManageConsumersClearance({ caseId: 'case1', triggeredByUserId: 'staff-1' });

        expect(r.checked).toBe(true);
        expect(r.statusUpdatedTo).toBe('READY_CLEARANCE');
        const statusUpdate = db.case.update.mock.calls.find((c) => c[0].data.status === 'READY_CLEARANCE');
        expect(statusUpdate).toBeTruthy();
        expect(statusUpdate?.[0].data.nextUpdate).toBeInstanceOf(Date);
        const comment = db.caseComment.create.mock.calls.find(
            (c) => c[0].data.activityType === 'DRR_CLEARANCE_RESULT',
        );
        expect(comment?.[0].data.content).toContain('Ready for Clearance');
    });

    it('moves the case to COMPLETED when the clearance code is 7+ days old', async () => {
        db.case.findUnique.mockResolvedValue(caseRow());
        history.mockResolvedValue({
            found: true,
            idNumber: '8001015009087',
            message: 'ok',
            evaluation: evaluation({
                eligible: true,
                currentCode: 'B',
                workflowStatus: 'COMPLETED',
                daysSinceStatus: 12,
                notes: ['Clearance-eligible code "B" dated 2026-06-22 (12 calendar day(s) ago) → Completed.'],
            }),
        });

        const r = await runManageConsumersClearance({ caseId: 'case1' });

        expect(r.statusUpdatedTo).toBe('COMPLETED');
    });

    it('keeps the status but sets a follow-up when the consumer is still in active debt review', async () => {
        db.case.findUnique.mockResolvedValue(caseRow());
        history.mockResolvedValue({
            found: true,
            idNumber: '8001015009087',
            message: 'ok',
            evaluation: evaluation({
                currentCode: 'C',
                workflowStatus: 'ACCEPTED_VIA_DHS',
                notes: ['Current status code "C" means the consumer is in active debt review → Accepted via DHS.'],
            }),
        });

        const r = await runManageConsumersClearance({ caseId: 'case1' });

        expect(r.statusUpdatedTo).toBeNull();
        expect(r.errors).toEqual([]);
        const statusChange = db.case.update.mock.calls.find((c) => c[0].data.status);
        expect(statusChange).toBeFalsy();
        // Follow-up was still scheduled
        const followUp = db.case.update.mock.calls.find((c) => c[0].data.nextUpdate);
        expect(followUp).toBeTruthy();
    });

    it('does not advance a case that staff manually moved elsewhere', async () => {
        db.case.findUnique.mockResolvedValue(caseRow({ status: 'READY_COURT_DATE' }));
        history.mockResolvedValue({
            found: true,
            idNumber: '8001015009087',
            message: 'ok',
            evaluation: evaluation({ eligible: true, currentCode: 'G', workflowStatus: 'READY_CLEARANCE', notes: ['n'] }),
        });

        const r = await runManageConsumersClearance({ caseId: 'case1' });

        expect(r.statusUpdatedTo).toBeNull();
        const statusChange = db.case.update.mock.calls.find((c) => c[0].data.status);
        expect(statusChange).toBeFalsy();
    });

    it('escalates to staff when the DHS status history cannot be read', async () => {
        db.case.findUnique.mockResolvedValue(caseRow());
        history.mockResolvedValue({
            found: false,
            idNumber: '8001015009087',
            message: 'Failed to login to DHS',
            evaluation: evaluation(),
        });

        const r = await runManageConsumersClearance({ caseId: 'case1' });

        expect(r.checked).toBe(false);
        expect(r.errors.join(' ')).toContain('Failed to login to DHS');
        const escalation = db.caseComment.create.mock.calls.find(
            (c) => c[0].data.activityType === 'DRR_CLEARANCE_CHECK_FAILED',
        );
        expect(escalation).toBeTruthy();
    });

    it('escalates when the client has no valid 13-digit ID number', async () => {
        db.case.findUnique.mockResolvedValue(caseRow({ client: { idNumber: '123', firstName: 'S', lastName: 'D' } }));

        const r = await runManageConsumersClearance({ caseId: 'case1' });

        expect(history).not.toHaveBeenCalled();
        expect(r.errors.join(' ')).toContain('13-digit ID number');
    });

    it('never throws — an unexpected error is captured and reported', async () => {
        db.case.findUnique.mockRejectedValue(new Error('db down'));

        const r = await runManageConsumersClearance({ caseId: 'case1' });

        expect(r.errors.join(' ')).toContain('db down');
        expect(r.checked).toBe(false);
    });
});
