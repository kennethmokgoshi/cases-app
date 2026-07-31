import { describe, it, expect } from 'vitest';
import { isClearanceButtonEligible, hasCreditReport } from './clearance-button-eligibility';

describe('clearance-button-eligibility', () => {
    describe('isClearanceButtonEligible', () => {
        it('returns true for ACCEPTED_VIA_DHS status', () => {
            expect(isClearanceButtonEligible({ status: 'ACCEPTED_VIA_DHS' })).toBe(true);
        });

        it('returns true for ACCEPTED_FORM_177 status', () => {
            expect(isClearanceButtonEligible({ status: 'ACCEPTED_FORM_177' })).toBe(true);
        });

        it('returns true for READY_TO_CONSENT and ZDM_CLIENT', () => {
            expect(isClearanceButtonEligible({ status: 'READY_TO_CONSENT' })).toBe(true);
            expect(isClearanceButtonEligible({ status: 'ZDM_CLIENT' })).toBe(true);
        });

        it('returns true for dhsStatus Accepted or Auto Transferred', () => {
            expect(isClearanceButtonEligible({ status: 'NEW_LEAD', dhsStatus: 'Accepted' })).toBe(true);
            expect(isClearanceButtonEligible({ status: 'NEW_LEAD', dhsStatus: 'Auto Transferred' })).toBe(true);
        });

        it('returns true when manuallyAcceptedViaDhs is true', () => {
            expect(isClearanceButtonEligible({ status: 'DECLINED_VIA_DHS', manuallyAcceptedViaDhs: true })).toBe(true);
        });

        it('returns false for unaccepted / pending statuses', () => {
            expect(isClearanceButtonEligible({ status: 'NEW_LEAD', dhsStatus: 'Pending' })).toBe(false);
            expect(isClearanceButtonEligible({ status: 'NOT_REQUESTED_VIA_DHS' })).toBe(false);
        });
    });

    describe('hasCreditReport', () => {
        it('returns true if hasCreditReportOnRecord is true', () => {
            expect(hasCreditReport({ hasCreditReportOnRecord: true })).toBe(true);
        });

        it('returns true if uploadedDocTypes contains CREDIT_REPORT or XDS_REPORT', () => {
            expect(hasCreditReport({ uploadedDocTypes: ['ID', 'CREDIT_REPORT'] })).toBe(true);
            expect(hasCreditReport({ uploadedDocTypes: ['POA', 'XDS_REPORT'] })).toBe(true);
        });

        it('returns true if documents list has CREDIT_REPORT', () => {
            expect(hasCreditReport({ documents: [{ documentType: 'CREDIT_REPORT' }] })).toBe(true);
        });

        it('returns false when credit report is missing', () => {
            expect(hasCreditReport({ uploadedDocTypes: ['ID', 'POA', 'BANK_STATEMENT'] })).toBe(false);
            expect(hasCreditReport({ documents: [{ documentType: 'FORM_16' }] })).toBe(false);
        });
    });
});
