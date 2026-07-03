export type CaseHeaderClientAction = 'manage-client' | 'convert-to-referrer';

export interface CaseHeaderClientActionInput {
    status: string | null | undefined;
    canManageReferrerConversion: boolean;
}

const ZDM_CLIENT_STATUS = 'ZDM_CLIENT';

function normalizeStatus(status: string | null | undefined): string {
    return (status ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function getCaseHeaderClientAction({
    status,
    canManageReferrerConversion,
}: CaseHeaderClientActionInput): CaseHeaderClientAction | null {
    if (!canManageReferrerConversion) return null;
    return normalizeStatus(status) === ZDM_CLIENT_STATUS ? 'manage-client' : 'convert-to-referrer';
}
