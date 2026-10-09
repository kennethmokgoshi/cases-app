import { describe, it, expect } from 'vitest';
import {
    decideLegalFeeAction,
    extractConsumerDhsCode,
    legalFeesStatusAfterPayment,
    LEGAL_FEES_STATUS_OPTIONS,
} from './legal-fee-rules';

describe('extractConsumerDhsCode', () => {
    it('reads the code from a labelled status', () => {
        expect(extractConsumerDhsCode('D4 - Under debt review with court order')).toBe('D4');
        expect(extractConsumerDhsCode(' d3 ')).toBe('D3');
    });
    it('returns null for empty values', () => {
        expect(extractConsumerDhsCode(null)).toBeNull();
        expect(extractConsumerDhsCode('')).toBeNull();
    });
});

describe('decideLegalFeeAction', () => {
    it.each(['D3', 'D4', 'D4 - Under debt review with court order'])('invoices an accepted %s file with nothing recorded', (code) => {
        expect(decideLegalFeeAction({ consumerDhsStatus: code, legalFeesStatus: null })).toEqual({ action: 'INVOICE' });
    });

    it.each(['', 'Not yet transferred', 'No Arrangement yet', 'no  legal fees'])('still invoices when Legal Fees Status is "%s"', (status) => {
        expect(decideLegalFeeAction({ consumerDhsStatus: 'D4', legalFeesStatus: status }).action).toBe('INVOICE');
    });

    it.each([
        'PR Fees Consent', 'Refused to Pay', 'Arrangement in progress', 'Paying', 'Authorised & Pending',
        'Debiting', 'Debited', 'Cash Focus', 'Fees Paid Cash', 'Invoiced & Pending', 'Settled',
    ])('never invoices over "%s"', (status) => {
        expect(decideLegalFeeAction({ consumerDhsStatus: 'D3', legalFeesStatus: status })).toEqual({
            action: 'SKIP', reason: 'LEGAL_FEES_ALREADY_HANDLED',
        });
    });

    it('A and C have no legal fee and only fill an unset status', () => {
        expect(decideLegalFeeAction({ consumerDhsStatus: 'A', legalFeesStatus: null })).toEqual({ action: 'NO_LEGAL_FEES', setStatus: true });
        expect(decideLegalFeeAction({ consumerDhsStatus: 'C', legalFeesStatus: 'Paying' })).toEqual({ action: 'NO_LEGAL_FEES', setStatus: false });
    });

    it('does nothing when the consumer code is not known', () => {
        expect(decideLegalFeeAction({ consumerDhsStatus: null, legalFeesStatus: null })).toEqual({ action: 'SKIP', reason: 'DHS_CODE_UNKNOWN' });
        expect(decideLegalFeeAction({ consumerDhsStatus: 'B', legalFeesStatus: null }).action).toBe('SKIP');
    });
});

describe('legalFeesStatusAfterPayment', () => {
    it('full EFT / cash deposit → Fees Paid Cash', () => {
        expect(legalFeesStatusAfterPayment({ current: 'No Arrangement yet', method: 'EFT', paid: 1700, total: 1700 })).toBe('Fees Paid Cash');
        expect(legalFeesStatusAfterPayment({ current: null, method: 'CASH', paid: 1700, total: 1700 })).toBe('Fees Paid Cash');
    });
    it('full debit order → Debited', () => {
        expect(legalFeesStatusAfterPayment({ current: 'Authorised & Pending', method: 'DEBIT_ORDER', paid: 1700, total: 1700 })).toBe('Debited');
    });
    it('part payment → Paying', () => {
        expect(legalFeesStatusAfterPayment({ current: 'Arrangement in progress', method: 'EFT', paid: 500, total: 1700 })).toBe('Paying');
    });
    it('never overwrites Cash Focus and skips no-op changes', () => {
        expect(legalFeesStatusAfterPayment({ current: 'Cash Focus', method: 'EFT', paid: 1700, total: 1700 })).toBeNull();
        expect(legalFeesStatusAfterPayment({ current: 'Paying', method: 'EFT', paid: 500, total: 1700 })).toBeNull();
    });
});

describe('LEGAL_FEES_STATUS_OPTIONS', () => {
    it('keeps Cash Focus and Fees Paid Cash as separate options and drops LF & AC Consent', () => {
        expect(LEGAL_FEES_STATUS_OPTIONS).toContain('Cash Focus');
        expect(LEGAL_FEES_STATUS_OPTIONS).toContain('Fees Paid Cash');
        expect(LEGAL_FEES_STATUS_OPTIONS).toContain('Not yet transferred');
        expect(LEGAL_FEES_STATUS_OPTIONS).not.toContain('LF & AC Consent');
    });
});
