// Server-only helper: resolve the mailboxes a user may search (active shared
// inboxes + their own personal one) with their IMAP passwords decrypted, and
// run a consumer search across them. Shared by the DHS decline "already
// handled?" inbox fallback and the "Check Communications" button so the
// credential-resolution logic lives in one place.

import { prisma } from '@zenowethu/database';
import { getSMTPCredentials } from '@zenowethu/shared-lib';
import {
    searchMailboxForConsumer,
    type ConsumerEmailMatch,
    type ConsumerSearchResult,
} from '@zenowethu/shared-lib/src/integrations/imap';
import { decryptSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { usesSmtpPassword } from '@/lib/mailboxes';
import { getSmtpUsernameIfConfigured } from '@/lib/mailbox-smtp';

export interface ResolvedMailbox {
    id: string;
    label: string;
    emailAddress: string;
    isDcCommunication: boolean;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    /** Decrypted IMAP password, or null when none is available (not searchable) */
    password: string | null;
}

/**
 * Mailboxes this user may search, each with its IMAP password resolved:
 * the mailbox's own encrypted password, or the shared Email (SMTP) Account
 * password when the mailbox address matches that login. Mailboxes without a
 * usable password come back with `password: null` (skipped by the search).
 */
export async function getSearchableMailboxesWithPasswords(userId: string): Promise<ResolvedMailbox[]> {
    const [rows, smtpUsername, smtp] = await Promise.all([
        prisma.mailboxAccount.findMany({
            where: { isActive: true, OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
            select: {
                id: true,
                label: true,
                emailAddress: true,
                isDcCommunication: true,
                password: true,
                imapHost: true,
                imapPort: true,
                imapSecure: true,
            },
            orderBy: { createdAt: 'asc' },
        }),
        getSmtpUsernameIfConfigured(),
        getSMTPCredentials().catch(() => null),
    ]);

    return rows.map((row) => {
        let password: string | null = null;
        if (row.password) {
            try {
                password = decryptSecret(row.password);
            } catch {
                password = null;
            }
        }
        if (!password && smtp?.password && usesSmtpPassword(row.emailAddress, password, smtpUsername)) {
            password = smtp.password;
        }
        return {
            id: row.id,
            label: row.label,
            emailAddress: row.emailAddress,
            isDcCommunication: row.isDcCommunication,
            imapHost: row.imapHost,
            imapPort: row.imapPort,
            imapSecure: row.imapSecure,
            password,
        };
    });
}

export interface ConsumerInboxSweep {
    /** Mailboxes that had a usable password and were actually searched */
    searchedMailboxes: number;
    /** Mailboxes skipped because no password is configured */
    skippedMailboxes: number;
    matches: ConsumerEmailMatch[];
    perMailbox: ConsumerSearchResult[];
    errors: string[];
}

/**
 * Search every readable mailbox for a consumer by ID number and/or full name.
 * Envelope-only (no bodies/attachments downloaded). Never throws — per-mailbox
 * failures are collected in `errors`.
 */
export async function searchConsumerAcrossMailboxes(params: {
    userId: string;
    idNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    since: Date;
    limitPerMailbox?: number;
}): Promise<ConsumerInboxSweep> {
    const mailboxes = await getSearchableMailboxesWithPasswords(params.userId);
    const readable = mailboxes.filter((m) => m.password);
    const skippedMailboxes = mailboxes.length - readable.length;

    const perMailbox: ConsumerSearchResult[] = [];
    const matches: ConsumerEmailMatch[] = [];
    const errors: string[] = [];

    for (const mailbox of readable) {
        const result = await searchMailboxForConsumer({
            config: {
                host: mailbox.imapHost,
                port: mailbox.imapPort,
                secure: mailbox.imapSecure,
                username: mailbox.emailAddress,
                password: mailbox.password as string,
            },
            mailboxLabel: mailbox.emailAddress,
            idNumber: params.idNumber,
            firstName: params.firstName,
            lastName: params.lastName,
            since: params.since,
            limit: params.limitPerMailbox ?? 50,
        });
        perMailbox.push(result);
        if (result.error) errors.push(`${mailbox.emailAddress}: ${result.error}`);
        matches.push(...result.matches);
    }

    matches.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    return {
        searchedMailboxes: readable.length,
        skippedMailboxes,
        matches,
        perMailbox,
        errors,
    };
}
