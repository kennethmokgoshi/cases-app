export interface DhsManageConsumersEligibilityInput {
    status: string | null | undefined;
    dhsStatus: string | null | undefined;
    manuallyAcceptedViaDhs: boolean;
}

const MANAGE_CONSUMERS_STATUSES = new Set([
    'ACCEPTEDVIADHS',
    'READYTOCONSENT',
    'CONSENTRECEIVED',
    'AWAITINGDRRDOCS',
    'ACCEPTED',
    'AUTOTRANSFERRED',
    'ZDMCLIENT',
]);

function normalizeDhsStatus(status: string | null | undefined): string {
    return (status ?? '').replace(/[\s_]+/g, '').toUpperCase();
}

export function canShowDhsManageConsumers({
    status,
    dhsStatus,
    manuallyAcceptedViaDhs,
}: DhsManageConsumersEligibilityInput): boolean {
    if (manuallyAcceptedViaDhs) return true;
    return MANAGE_CONSUMERS_STATUSES.has(normalizeDhsStatus(status))
        || MANAGE_CONSUMERS_STATUSES.has(normalizeDhsStatus(dhsStatus));
}
