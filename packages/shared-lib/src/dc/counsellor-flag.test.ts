import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
    case: {
        findUnique: vi.fn(),
    },
    user: {
        findFirst: vi.fn(),
    },
    caseComment: {
        create: vi.fn(),
    },
    $transaction: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({ prisma: mockDb }));

import {
    checkFlaggedDebtCounsellor,
    checkCaseFlaggedDC,
} from './counsellor-flag';
import {
    flagCaseIfFlaggedDC
} from './counsellor-flag-db';

describe('checkFlaggedDebtCounsellor', () => {
    it('correctly identifies Debt Busters variations', () => {
        expect(checkFlaggedDebtCounsellor('Debt Busters').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('Debt Busters').provider).toBe('Debt Busters');
        expect(checkFlaggedDebtCounsellor('debtbusters').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('debtbusters').provider).toBe('Debt Busters');
        expect(checkFlaggedDebtCounsellor('Debt Busters (Pty) Ltd').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('Debt Busters (Pty) Ltd').provider).toBe('Debt Busters');
    });

    it('correctly identifies Octogen variations', () => {
        expect(checkFlaggedDebtCounsellor('Octogen').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('Octogen').provider).toBe('Octogen');
        expect(checkFlaggedDebtCounsellor('OCTOGEN Ltd').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('OCTOGEN Ltd').provider).toBe('Octogen');
    });

    it('correctly identifies NDC variations', () => {
        expect(checkFlaggedDebtCounsellor('NDC').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('NDC').provider).toBe('NDC');
        expect(checkFlaggedDebtCounsellor('ndc (pty)').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('ndc (pty)').provider).toBe('NDC');
        expect(checkFlaggedDebtCounsellor('National Debt Counsel').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('National Debt Counsel').provider).toBe('NDC');
        expect(checkFlaggedDebtCounsellor('National Debt Counsellors').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('National Debt Counsellors').provider).toBe('NDC');
        expect(checkFlaggedDebtCounsellor('National Debt Advisors').flagged).toBe(true);
        expect(checkFlaggedDebtCounsellor('National Debt Advisors').provider).toBe('NDC');
    });

    it('does not flag standard or partial match words', () => {
        expect(checkFlaggedDebtCounsellor('Zenowethu Cases').flagged).toBe(false);
        expect(checkFlaggedDebtCounsellor('Standard Debt Counselling').flagged).toBe(false);
        expect(checkFlaggedDebtCounsellor('under the bridge').flagged).toBe(false);
        expect(checkFlaggedDebtCounsellor('index of credit').flagged).toBe(false);
    });

    it('handles empty / undefined inputs', () => {
        expect(checkFlaggedDebtCounsellor(null).flagged).toBe(false);
        expect(checkFlaggedDebtCounsellor(undefined).flagged).toBe(false);
        expect(checkFlaggedDebtCounsellor('').flagged).toBe(false);
    });
});

describe('checkCaseFlaggedDC', () => {
    it('returns flagged if any field matches', () => {
        expect(checkCaseFlaggedDC({
            debtCounsellorName: 'Debt Busters',
            dcTradingName: 'Standard',
            cb_debtCounsellor: 'None'
        }).flagged).toBe(true);

        expect(checkCaseFlaggedDC({
            debtCounsellorName: 'Standard',
            dcTradingName: 'Octogen',
            cb_debtCounsellor: 'None'
        }).flagged).toBe(true);

        expect(checkCaseFlaggedDC({
            debtCounsellorName: 'Standard',
            dcTradingName: 'Standard',
            cb_debtCounsellor: 'NDC'
        }).flagged).toBe(true);
    });

    it('returns false if no field is flagged', () => {
        expect(checkCaseFlaggedDC({
            debtCounsellorName: 'Standard',
            dcTradingName: 'Standard',
            cb_debtCounsellor: 'Standard'
        }).flagged).toBe(false);
    });
});

describe('flagCaseIfFlaggedDC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates case comment if flagged and not already flagged', async () => {
        mockDb.case.findUnique.mockResolvedValue({
            id: 'case-1',
            debtCounsellorName: 'Debt Busters',
            dcTradingName: null,
            cb_debtCounsellor: null,
            comments: []
        });
        mockDb.user.findFirst.mockResolvedValue({ id: 'admin-1' });

        await flagCaseIfFlaggedDC('case-1', mockDb);

        expect(mockDb.caseComment.create).toHaveBeenCalledWith({
            data: {
                caseId: 'case-1',
                userId: 'admin-1',
                content: expect.stringContaining('[SYSTEM] 🚩 Flagged Debt Counsellor Alert: This client is registered under Debt Busters'),
                activityType: 'SYSTEM',
                type: 'NOTE',
                isInternal: true
            }
        });
    });

    it('does not create case comment if not flagged', async () => {
        mockDb.case.findUnique.mockResolvedValue({
            id: 'case-2',
            debtCounsellorName: 'Standard Counsellor',
            dcTradingName: null,
            cb_debtCounsellor: null,
            comments: []
        });

        await flagCaseIfFlaggedDC('case-2', mockDb);

        expect(mockDb.caseComment.create).not.toHaveBeenCalled();
    });

    it('does not duplicate comment if warning comment already exists', async () => {
        mockDb.case.findUnique.mockResolvedValue({
            id: 'case-3',
            debtCounsellorName: 'Octogen',
            dcTradingName: null,
            cb_debtCounsellor: null,
            comments: [{ id: 'comment-1', content: '[SYSTEM] 🚩 Flagged Debt Counsellor Alert: ...' }]
        });

        await flagCaseIfFlaggedDC('case-3', mockDb);

        expect(mockDb.caseComment.create).not.toHaveBeenCalled();
    });
});
