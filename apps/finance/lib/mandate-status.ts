// Pure debit order mandate lifecycle logic — no Prisma/Next, fully unit-testable.

export const MANDATE_STATUSES = [
    'DRAFT',
    'SENT',
    'SIGNED',
    'REGISTERED',
    'ACTIVE',
    'CANCELLED',
    'REJECTED',
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export const MANDATE_FREQUENCIES = ['MONTHLY', 'WEEKLY'] as const;
export type MandateFrequency = (typeof MANDATE_FREQUENCIES)[number];

export type MandateLike = {
    requested: boolean;
    status: string;
    amount: number | string | null;
    bankName: string | null;
    accountNumber: string | null;
    branchCode: string | null;
    sentAt: Date | string | null;
    signedReturnedAt: Date | string | null;
    signedDocumentId: string | null;
    nupayDocumentId: string | null;
    nupayReference: string | null;
};

export type ChecklistItem = {
    key: 'requested' | 'banking' | 'amount' | 'sent' | 'signedBack' | 'signedUpload' | 'nupayUpload';
    label: string;
    done: boolean;
};

/**
 * Drives the mandate panel: which lifecycle steps are complete.
 */
export function buildMandateChecklist(m: MandateLike): ChecklistItem[] {
    const hasBanking = Boolean(m.bankName && m.accountNumber && m.branchCode);
    const hasAmount = m.amount !== null && m.amount !== undefined && Number(m.amount) > 0;
    return [
        { key: 'requested', label: 'Debit order requested by consumer', done: Boolean(m.requested) },
        { key: 'banking', label: 'Banking details captured', done: hasBanking },
        { key: 'amount', label: 'Mandate amount set', done: hasAmount },
        { key: 'sent', label: 'Mandate sent to consumer', done: Boolean(m.sentAt) },
        { key: 'signedBack', label: 'Signed mandate returned', done: Boolean(m.signedReturnedAt) },
        { key: 'signedUpload', label: 'Signed mandate uploaded', done: Boolean(m.signedDocumentId) },
        { key: 'nupayUpload', label: 'NuPay mandate uploaded', done: Boolean(m.nupayDocumentId) },
    ];
}

/**
 * Percentage of the lifecycle completed (0–100), based on the checklist.
 */
export function mandateProgress(m: MandateLike): number {
    const items = buildMandateChecklist(m);
    const done = items.filter(i => i.done).length;
    return Math.round((done / items.length) * 100);
}

/**
 * The single most useful next action a staff member should take.
 * Returns null when the mandate is fully set up, cancelled or rejected.
 */
export function nextMandateAction(m: MandateLike): string | null {
    if (m.status === 'CANCELLED') return null;
    if (m.status === 'REJECTED') return 'Consumer rejected the mandate — confirm an alternative payment method';
    if (!m.requested) return 'Confirm whether the consumer wants a debit order mandate';
    if (!(m.bankName && m.accountNumber && m.branchCode)) return 'Capture the consumer’s banking details';
    if (!(m.amount && Number(m.amount) > 0)) return 'Set the mandate amount';
    if (!m.sentAt) return 'Send the mandate to the consumer for signature';
    if (!m.signedReturnedAt || !m.signedDocumentId) return 'Upload the signed mandate returned by the consumer';
    if (!m.nupayDocumentId) return 'Upload the NuPay registration mandate';
    return null;
}

/**
 * Whether moving from one status to another is allowed. Keeps the lifecycle sane
 * (e.g. you can't mark a draft ACTIVE before it's REGISTERED). CANCELLED/REJECTED
 * are reachable from any non-terminal state.
 */
const ALLOWED_TRANSITIONS: Record<MandateStatus, MandateStatus[]> = {
    DRAFT: ['SENT', 'CANCELLED'],
    SENT: ['SIGNED', 'REJECTED', 'CANCELLED', 'DRAFT'],
    SIGNED: ['REGISTERED', 'CANCELLED'],
    REGISTERED: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['CANCELLED'],
    CANCELLED: [],
    REJECTED: ['DRAFT', 'CANCELLED'],
};

export function canTransition(from: string, to: string): boolean {
    if (from === to) return true;
    if (!isMandateStatus(from) || !isMandateStatus(to)) return false;
    return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isMandateStatus(value: string): value is MandateStatus {
    return (MANDATE_STATUSES as readonly string[]).includes(value);
}
