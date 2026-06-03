import { describe, it, expect } from 'vitest';
import { classifyDeclineReason, extractEmailFromReason } from './decline-handler';

describe('classifyDeclineReason', () => {
    // SEND_DOCS
    it('classifies "No transfer documents" as SEND_DOCS', () => {
        expect(classifyDeclineReason(
            'No transfer documents have been received. Please send recent signed and dated POA, and copy of barcode ID to transfers@debtbusters.co.za'
        )).toBe('SEND_DOCS');
    });

    it('classifies "Please send signed and dated POA" as SEND_DOCS', () => {
        expect(classifyDeclineReason('Please send recent signed and dated POA and copy of ID')).toBe('SEND_DOCS');
    });

    it('classifies "FORM 16" mention as SEND_DOCS', () => {
        expect(classifyDeclineReason('Please submit Form 16 and supporting documentation')).toBe('SEND_DOCS');
    });

    // SEND_DOCS_WITH_NCR
    it('classifies "NCR certificate" as SEND_DOCS_WITH_NCR', () => {
        expect(classifyDeclineReason(
            'Please send valid NCR certificate, POA and ID to our office'
        )).toBe('SEND_DOCS_WITH_NCR');
    });

    it('classifies "Sent valid ncr certificate" as SEND_DOCS_WITH_NCR', () => {
        expect(classifyDeclineReason('Sent valid ncr certificate, please attach POA')).toBe('SEND_DOCS_WITH_NCR');
    });

    // CLIENT_CONSENT_NEEDED
    it('classifies "Unable to confirm transfer with client" as CLIENT_CONSENT_NEEDED', () => {
        expect(classifyDeclineReason(
            'Unable to confirm transfer with client, kindly request that client contacts me on arushkah@ndadc.co.za'
        )).toBe('CLIENT_CONSENT_NEEDED');
    });

    it('classifies "client has not consented" as CLIENT_CONSENT_NEEDED', () => {
        expect(classifyDeclineReason('Client has not consented to the transfer')).toBe('CLIENT_CONSENT_NEEDED');
    });

    it('classifies "kindly request that client contacts" as CLIENT_CONSENT_NEEDED', () => {
        expect(classifyDeclineReason('kindly request that client contacts me at my office to confirm consent')).toBe('CLIENT_CONSENT_NEEDED');
    });

    // OUTSTANDING_FEES
    it('classifies "client owes fees" as OUTSTANDING_FEES', () => {
        expect(classifyDeclineReason('Client owes R1500 in after-care fees')).toBe('OUTSTANDING_FEES');
    });

    it('classifies "outstanding fees" as OUTSTANDING_FEES', () => {
        expect(classifyDeclineReason('There are outstanding fees of R850 that must be settled first')).toBe('OUTSTANDING_FEES');
    });

    it('classifies "balance outstanding" as OUTSTANDING_FEES', () => {
        expect(classifyDeclineReason('Consumer has a balance outstanding before transfer can proceed')).toBe('OUTSTANDING_FEES');
    });

    // CONTACT_ATTORNEY
    it('classifies "attorney" mention as CONTACT_ATTORNEY', () => {
        expect(classifyDeclineReason('File has been handed to attorney Smith at attorney@lawfirm.co.za')).toBe('CONTACT_ATTORNEY');
    });

    it('classifies "court order" as CONTACT_ATTORNEY', () => {
        expect(classifyDeclineReason('Matter is subject to a court order, please contact our legal department')).toBe('CONTACT_ATTORNEY');
    });

    // RESUBMIT_LATER
    it('classifies "try again" as RESUBMIT_LATER', () => {
        expect(classifyDeclineReason('Please try again later, we are currently processing this file')).toBe('RESUBMIT_LATER');
    });

    it('classifies "currently processing" as RESUBMIT_LATER', () => {
        expect(classifyDeclineReason('Currently processing consumer file, please resubmit in 7 days')).toBe('RESUBMIT_LATER');
    });

    // UNKNOWN
    it('classifies real-world typo "Please sent tranfer documents" as SEND_DOCS', () => {
        expect(classifyDeclineReason('Please sent tranfer documents to info@onmnconsulting.co.za')).toBe('SEND_DOCS');
    });

    it('classifies "transfer documents" without send/please as SEND_DOCS', () => {
        expect(classifyDeclineReason('Kindly forward transfer documents to dc@firm.co.za')).toBe('SEND_DOCS');
    });

    it('returns UNKNOWN for unrecognised text', () => {
        expect(classifyDeclineReason('The reason is unknown at this time')).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for empty string', () => {
        expect(classifyDeclineReason('')).toBe('UNKNOWN');
    });

    // Priority: SEND_DOCS_WITH_NCR should win over SEND_DOCS when both match
    it('prefers SEND_DOCS_WITH_NCR over SEND_DOCS when NCR cert is mentioned', () => {
        expect(classifyDeclineReason(
            'No transfer documents received. Please send POA, ID, and valid NCR certificate to transfers@firm.co.za'
        )).toBe('SEND_DOCS_WITH_NCR');
    });
});

describe('extractEmailFromReason', () => {
    it('extracts email from decline reason text', () => {
        expect(extractEmailFromReason(
            'Please send documents to transfers@debtbusters.co.za at your earliest convenience'
        )).toBe('transfers@debtbusters.co.za');
    });

    it('extracts email from "contact me on email@domain.com" style text', () => {
        expect(extractEmailFromReason(
            'Unable to confirm, kindly request that client contacts me on arushkah@ndadc.co.za'
        )).toBe('arushkah@ndadc.co.za');
    });

    it('returns null when no email is present', () => {
        expect(extractEmailFromReason('No transfer documents received')).toBeNull();
    });

    it('returns the first email when multiple are present', () => {
        expect(extractEmailFromReason(
            'Send to first@firm.co.za or second@firm.co.za'
        )).toBe('first@firm.co.za');
    });

    it('returns null for empty string', () => {
        expect(extractEmailFromReason('')).toBeNull();
    });
});
