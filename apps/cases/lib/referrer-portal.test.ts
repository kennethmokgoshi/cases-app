import { describe, expect, it } from 'vitest';
import {
    calculatePortalCommissionTotals,
    maskAccountNumber,
    maskConsumerName,
    portalCommissionStatus,
    portalStageLabel,
} from './referrer-portal';

describe('referrer portal privacy helpers', () => {
    it('masks consumer names to initial and surname only', () => {
        expect(maskConsumerName('Thabo', 'Mokoena')).toBe('T. Mokoena');
        expect(maskConsumerName('  lerato ', '  Dlamini  ')).toBe('L. Dlamini');
    });

    it('falls back safely when name fields are missing', () => {
        expect(maskConsumerName(null, null)).toBe('Referral client');
        expect(maskConsumerName('Amahle', null)).toBe('A.');
    });

    it('masks account numbers except the last four digits', () => {
        expect(maskAccountNumber('6212 3456 789')).toBe('*******6789');
        expect(maskAccountNumber(null)).toBeNull();
    });
});

describe('referrer portal commission helpers', () => {
    it('calculates earned, pending, and paid totals', () => {
        const totals = calculatePortalCommissionTotals([
            { isEligible: true, isPaid: false, commissionAmount: 200 },
            { isEligible: true, isPaid: true, commissionAmount: { toNumber: () => 300 } },
            { isEligible: false, isPaid: false, commissionAmount: 500 },
        ]);

        expect(totals).toEqual({
            totalReferrals: 3,
            commissionEarned: 500,
            commissionPending: 200,
            commissionPaid: 300,
        });
    });

    it('maps internal commission stages to referrer-safe labels', () => {
        expect(portalStageLabel('DEPOSIT_PAID')).toBe('Deposit paid');
        expect(portalStageLabel('ARREARS_3M')).toBe('Payment follow-up');
        expect(portalStageLabel(null)).toBe('In progress');
    });

    it('shows the payout status without exposing internal workflow notes', () => {
        expect(portalCommissionStatus({ isEligible: false, isPaid: false })).toBe('In progress');
        expect(portalCommissionStatus({ isEligible: true, isPaid: false })).toBe('Ready for payout');
        expect(portalCommissionStatus({ isEligible: true, isPaid: false, paymentRef: 'EFT-1' })).toBe('Paid');
    });
});
