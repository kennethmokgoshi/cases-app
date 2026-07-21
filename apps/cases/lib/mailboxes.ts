// Shared helpers for the mailbox-account settings API.
// Passwords are stored encrypted and are never returned to the client —
// responses expose only a hasPassword flag.

export const MAILBOX_PUBLIC_SELECT = {
    id: true,
    label: true,
    emailAddress: true,
    imapHost: true,
    imapPort: true,
    imapSecure: true,
    isDcCommunication: true,
    isActive: true,
    ownerUserId: true,
    notes: true,
    lastCheckedAt: true,
    updatedAt: true,
    password: true, // reduced to hasPassword in toPublicMailbox — never returned raw
    owner: { select: { firstName: true, lastName: true } },
} as const;

export interface MailboxRow {
    id: string;
    label: string;
    emailAddress: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    isDcCommunication: boolean;
    isActive: boolean;
    ownerUserId: string | null;
    notes: string | null;
    lastCheckedAt: Date | null;
    updatedAt: Date;
    password: string | null;
    owner: { firstName: string; lastName: string } | null;
}

export type PublicMailbox = Omit<MailboxRow, 'password' | 'owner'> & {
    hasPassword: boolean;
    // 'own' = password saved on the mailbox itself; 'smtp' = the mailbox address
    // matches the Email (SMTP) Account login, so its saved password is reused
    passwordSource: 'own' | 'smtp' | null;
    ownerName: string | null;
};

export function isUsableMailboxPassword(password: string | null | undefined): boolean {
    if (!password) return false;
    const trimmed = String(password).trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (['no-password-saved', 'placeholder', 'dummy', 'none', 'undefined', 'null'].includes(lower)) {
        return false;
    }
    return true;
}

export function usesSmtpPassword(
    emailAddress: string,
    ownPassword: string | null,
    smtpUsername: string | null | undefined,
): boolean {
    return !isUsableMailboxPassword(ownPassword) && Boolean(smtpUsername) && emailAddress.toLowerCase() === smtpUsername!.toLowerCase();
}

export function isGmailMailbox(emailAddress: string | null | undefined, imapHost: string | null | undefined): boolean {
    const email = (emailAddress ?? '').trim().toLowerCase();
    const host = (imapHost ?? '').trim().toLowerCase();
    return host.includes('gmail') || email.endsWith('@gmail.com') || email.endsWith('@googlemail.com');
}

export function toPublicMailbox(m: MailboxRow, smtpUsername?: string | null): PublicMailbox {
    const { password, owner, ...rest } = m;
    const hasOwnPassword = isUsableMailboxPassword(password);
    const smtpFallback = usesSmtpPassword(m.emailAddress, password, smtpUsername);
    return {
        ...rest,
        hasPassword: hasOwnPassword || smtpFallback,
        passwordSource: hasOwnPassword ? 'own' : smtpFallback ? 'smtp' : null,
        ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null,
    };
}

// Workflow statuses where staff are waiting on an invoice from the other debt
// counsellor — the "Check invoice emails" mailbox search is offered on these.
// IRFDC_* are the 1/2/3/4+ month "Invoice Requested from DC" detour statuses.
export function isInvoiceRequestedFromDcStatus(status: string | null | undefined): boolean {
    if (!status) return false;
    return status === 'INVOICE_REQUESTED_DC' || status.startsWith('IRFDC_');
}
