export interface DhsRequestEligibilityInput {
    status?: string | null;
    dhsStatus?: string | null;
    requestedDhsStatus?: string | null;
    dhsPreviousStatus?: string | null;
    workflowLogs?: Array<{ fromStatus?: string | null; toStatus?: string | null }> | null;
}

/**
 * Returns true if the case status or workflow status indicates that DHS transfer request
 * can/should be initiated (e.g. status is NOT_REQUESTED_VIA_DHS, PENDING, DECLINED, or dhsStatus contains Not Requested).
 */
export function shouldShowRequestViaDhs(input: DhsRequestEligibilityInput): boolean {
    const mainStatus = (input.status || '').toUpperCase().trim();
    const dhsStatus = (input.dhsStatus || '').toUpperCase().trim();
    const dhsStatusClean = dhsStatus.replace(/[\s_]+/g, '');

    // Check main status
    if (
        mainStatus === 'NOT_REQUESTED_VIA_DHS' ||
        mainStatus.includes('NOT_REQUESTED') ||
        mainStatus.includes('NOT REQUESTED')
    ) {
        return true;
    }

    // Check dhsStatus
    if (
        dhsStatus === 'NOT_REQUESTED_VIA_DHS' ||
        dhsStatus === 'PENDING' ||
        dhsStatus === 'DECLINED' ||
        dhsStatusClean.includes('NOTREQUESTED') ||
        dhsStatus.includes('NOT REQUESTED')
    ) {
        return true;
    }

    return false;
}

/**
 * Checks if the case was previously requested via DHS.
 */
export function wasPreviouslyRequestedViaDhs(input: DhsRequestEligibilityInput): boolean {
    if (input.requestedDhsStatus && !input.requestedDhsStatus.toUpperCase().includes('NOT REQUESTED')) {
        return true;
    }

    if (input.dhsPreviousStatus && input.dhsPreviousStatus.trim() !== '') {
        return true;
    }

    if (input.workflowLogs && Array.isArray(input.workflowLogs)) {
        const hasLog = input.workflowLogs.some(
            (log) => log.toStatus === 'REQUESTED_VIA_DHS' || log.fromStatus === 'REQUESTED_VIA_DHS'
        );
        if (hasLog) return true;
    }

    return false;
}

/**
 * Returns the button text for requesting via DHS:
 * "Request via DHS Again" if previously requested, otherwise "Request via DHS".
 */
export function getRequestViaDhsButtonLabel(
    input: DhsRequestEligibilityInput,
    isRequesting: boolean = false
): string {
    if (isRequesting) return 'Requesting...';
    return wasPreviouslyRequestedViaDhs(input) ? 'Request via DHS Again' : 'Request via DHS';
}
