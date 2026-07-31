import { describe, expect, it } from 'vitest';
import {
    shouldShowRequestViaDhs,
    wasPreviouslyRequestedViaDhs,
    getRequestViaDhsButtonLabel,
} from './dhs-request-eligibility';

describe('dhs-request-eligibility', () => {
    describe('shouldShowRequestViaDhs', () => {
        it('returns true when status is NOT_REQUESTED_VIA_DHS', () => {
            expect(shouldShowRequestViaDhs({ status: 'NOT_REQUESTED_VIA_DHS', dhsStatus: 'Not set' })).toBe(true);
        });

        it('returns true when dhsStatus is Not Requested via DHS', () => {
            expect(shouldShowRequestViaDhs({ status: 'A', dhsStatus: 'Not Requested via DHS' })).toBe(true);
        });

        it('returns true when dhsStatus is PENDING or DECLINED', () => {
            expect(shouldShowRequestViaDhs({ status: 'A', dhsStatus: 'PENDING' })).toBe(true);
            expect(shouldShowRequestViaDhs({ status: 'A', dhsStatus: 'DECLINED' })).toBe(true);
        });

        it('returns false for ACCEPTED_VIA_DHS status without not-requested indicators', () => {
            expect(shouldShowRequestViaDhs({ status: 'ACCEPTED_VIA_DHS', dhsStatus: 'Accepted' })).toBe(false);
        });
    });

    describe('wasPreviouslyRequestedViaDhs', () => {
        it('returns true if requestedDhsStatus is set and not "Not Requested"', () => {
            expect(wasPreviouslyRequestedViaDhs({ requestedDhsStatus: 'Pending (5 Days)' })).toBe(true);
        });

        it('returns true if dhsPreviousStatus is populated', () => {
            expect(wasPreviouslyRequestedViaDhs({ dhsPreviousStatus: 'Transfer Requested' })).toBe(true);
        });

        it('returns true if workflowLogs contain REQUESTED_VIA_DHS transition', () => {
            expect(wasPreviouslyRequestedViaDhs({
                workflowLogs: [{ fromStatus: 'NOT_REQUESTED_VIA_DHS', toStatus: 'REQUESTED_VIA_DHS' }]
            })).toBe(true);
        });

        it('returns false if never requested before', () => {
            expect(wasPreviouslyRequestedViaDhs({
                status: 'NOT_REQUESTED_VIA_DHS',
                dhsStatus: 'Not Requested via DHS',
                requestedDhsStatus: 'Not Requested via DHS',
                workflowLogs: []
            })).toBe(false);
        });
    });

    describe('getRequestViaDhsButtonLabel', () => {
        it('returns "Requesting..." when isRequesting is true', () => {
            expect(getRequestViaDhsButtonLabel({ status: 'NOT_REQUESTED_VIA_DHS' }, true)).toBe('Requesting...');
        });

        it('returns "Request via DHS" for new non-requested files', () => {
            expect(getRequestViaDhsButtonLabel({ status: 'NOT_REQUESTED_VIA_DHS' }, false)).toBe('Request via DHS');
        });

        it('returns "Request via DHS Again" for previously requested files', () => {
            expect(getRequestViaDhsButtonLabel({
                status: 'NOT_REQUESTED_VIA_DHS',
                requestedDhsStatus: 'Pending (3 Days)'
            }, false)).toBe('Request via DHS Again');
        });
    });
});
