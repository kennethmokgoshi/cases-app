import { ImapFlow } from 'imapflow';
import { createLogger } from '../logger';

const logger = createLogger('integrations/imap');

export interface ImapConnectionConfig {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
}

export interface ImapVerifyResult {
    success: boolean;
    message?: string;
    error?: string;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function addUnique(parts: string[], value: unknown) {
    const text = asString(value);
    if (text && !parts.some(part => part.toLowerCase() === text.toLowerCase())) {
        parts.push(text);
    }
}

function errorDetail(err: unknown, key: string): unknown {
    return typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

export function formatImapConnectionError(err: unknown, config: Pick<ImapConnectionConfig, 'host' | 'username'>): string {
    const parts: string[] = [];
    addUnique(parts, err instanceof Error ? err.message : String(err));
    addUnique(parts, errorDetail(err, 'responseText'));
    addUnique(parts, errorDetail(err, 'responseStatus'));
    addUnique(parts, errorDetail(err, 'code'));
    addUnique(parts, errorDetail(err, 'serverResponseCode'));

    const base = parts.length > 0 ? parts.join(' - ') : 'IMAP connection failed';
    const host = config.host.toLowerCase();
    const username = config.username.toLowerCase();
    const isGmail =
        host.includes('gmail') ||
        username.endsWith('@gmail.com') ||
        username.endsWith('@googlemail.com');
    const looksLikeAuthFailure = /auth|login|credential|password|invalid|account|user|command failed|application-specific/i.test(base);

    if (isGmail && looksLikeAuthFailure) {
        return `${base} - Gmail IMAP does not accept the normal Gmail login password here. Confirm IMAP access is allowed for the account, then create a Google App Password (Google Account > Security > 2-Step Verification > App passwords) and paste that 16-digit app password into this mailbox.`;
    }

    if (looksLikeAuthFailure) {
        return `${base} - Check the mailbox email address and saved password.`;
    }

    return base;
}

// Connect + authenticate + logout, nothing else. Used by the mailbox
// "Test connection" action and (later) the invoice inbox worker.
export async function verifyImapConnection(config: ImapConnectionConfig): Promise<ImapVerifyResult> {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.username, pass: config.password },
        logger: false,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        tls: { rejectUnauthorized: false },
    });

    try {
        await client.connect();
        await client.logout();
        logger.info(`[IMAP] Connection verified for ${config.username}@${config.host}:${config.port}`);
        return { success: true, message: `Login successful as ${config.username}` };
    } catch (err: unknown) {
        const error = formatImapConnectionError(err, config);
        logger.warn(`[IMAP] Connection failed for ${config.username}@${config.host}:${config.port}: ${error}`);
        return { success: false, error };
    } finally {
        try { client.close(); } catch { /* already closed */ }
    }
}

export interface ScanResult {
    emailsScanned: number;
    newEmailsFound: number;
    invoiceCandidatesFound: number;
    attachments: {
        fileName: string;
        mimeType: string;
        buffer: Buffer;
        isPoP: boolean;
        isInvoice: boolean;
    }[];
}

export type ConsumerMatchKey = 'ID_NUMBER' | 'NAME';

export interface ConsumerEmailMatch {
    mailbox: string;
    uid: number;
    messageId: string | null;
    from: string;
    to: string;
    subject: string;
    /** ISO date string of the message, or null when the server omits it */
    date: string | null;
    seen: boolean;
    /** Which identifier(s) matched this message */
    matchedOn: ConsumerMatchKey[];
}

export interface ConsumerSearchResult {
    mailbox: string;
    scanned: number;
    matches: ConsumerEmailMatch[];
    /** Populated when the mailbox could not be searched; matches will be empty */
    error?: string;
}

/** Render an imapflow envelope address list ("Name <a@b.com>") to a flat string. */
function formatAddressList(list: unknown): string {
    if (!Array.isArray(list)) return '';
    return list
        .map((entry) => {
            const addr = entry as { name?: string; address?: string };
            const address = asString(addr.address);
            const name = asString(addr.name);
            if (name && address) return `${name} <${address}>`;
            return address || name || '';
        })
        .filter(Boolean)
        .join(', ');
}

/**
 * Build a ConsumerEmailMatch from an imapflow message. Pure so it can be unit
 * tested without a live IMAP server.
 */
export function mapEnvelopeToMatch(
    mailbox: string,
    msg: {
        uid: number;
        flags?: Set<string>;
        envelope?: {
            messageId?: string;
            subject?: string;
            date?: Date | string;
            from?: unknown;
            to?: unknown;
        };
    },
    matchedOn: ConsumerMatchKey[],
): ConsumerEmailMatch {
    const env = msg.envelope ?? {};
    let date: string | null = null;
    if (env.date) {
        const d = env.date instanceof Date ? env.date : new Date(env.date);
        date = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return {
        mailbox,
        uid: msg.uid,
        messageId: asString(env.messageId),
        from: formatAddressList(env.from),
        to: formatAddressList(env.to),
        subject: asString(env.subject) ?? '(no subject)',
        date,
        seen: msg.flags instanceof Set ? msg.flags.has('\\Seen') : false,
        matchedOn,
    };
}

/**
 * Search a single mailbox's INBOX for any message referencing a consumer by
 * ID number and/or full name (first + last). Returns message envelopes only —
 * no bodies or attachments are downloaded — so it is safe to run across several
 * mailboxes interactively. Never throws: connection/search failures are
 * reported via the `error` field so one bad mailbox does not abort the sweep.
 */
export async function searchMailboxForConsumer({
    config,
    mailboxLabel,
    idNumber,
    firstName,
    lastName,
    since,
    limit = 50,
}: {
    config: ImapConnectionConfig;
    mailboxLabel: string;
    idNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    since: Date;
    limit?: number;
}): Promise<ConsumerSearchResult> {
    const trimmedId = asString(idNumber);
    const trimmedFirst = asString(firstName);
    const trimmedLast = asString(lastName);
    const fullName = trimmedFirst && trimmedLast ? `${trimmedFirst} ${trimmedLast}` : null;

    if (!trimmedId && !fullName) {
        return { mailbox: mailboxLabel, scanned: 0, matches: [], error: 'No ID number or full name to search for' };
    }

    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.username, pass: config.password },
        logger: false,
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        tls: { rejectUnauthorized: false },
    });

    let lock;
    try {
        await client.connect();
        lock = await client.getMailboxLock('INBOX');

        // Search per-identifier and merge, so each hit records what matched it.
        const matchedOnByUid = new Map<number, Set<ConsumerMatchKey>>();
        const addUids = (uids: unknown, key: ConsumerMatchKey) => {
            if (!Array.isArray(uids)) return;
            for (const uid of uids as number[]) {
                const set = matchedOnByUid.get(uid) ?? new Set<ConsumerMatchKey>();
                set.add(key);
                matchedOnByUid.set(uid, set);
            }
        };

        if (trimmedId) {
            addUids(await client.search({ text: trimmedId, since }, { uid: true }), 'ID_NUMBER');
        }
        if (fullName) {
            addUids(await client.search({ text: fullName, since }, { uid: true }), 'NAME');
        }

        const allUids = [...matchedOnByUid.keys()];
        const scanned = allUids.length;
        // Most recent first, capped so a busy mailbox can't flood the response.
        const uidsToFetch = allUids.sort((a, b) => b - a).slice(0, limit);

        const matches: ConsumerEmailMatch[] = [];
        if (uidsToFetch.length > 0) {
            for await (const msg of client.fetch(uidsToFetch, { uid: true, envelope: true, flags: true })) {
                const keys = [...(matchedOnByUid.get(msg.uid) ?? [])];
                matches.push(mapEnvelopeToMatch(mailboxLabel, msg, keys));
            }
        }

        matches.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        return { mailbox: mailboxLabel, scanned, matches };
    } catch (err: unknown) {
        const error = formatImapConnectionError(err, config);
        logger.warn(`[IMAP] Consumer search failed for ${config.username}@${config.host}: ${error}`);
        return { mailbox: mailboxLabel, scanned: 0, matches: [], error };
    } finally {
        if (lock) {
            try { lock.release(); } catch { /* ignore */ }
        }
        try { await client.logout(); } catch { /* ignore */ }
    }
}

export async function scanMailboxForClient({
    config,
    idNumber,
    since,
    onProgress,
}: {
    config: ImapConnectionConfig;
    idNumber: string;
    since: Date;
    onProgress?: (stats: { processed: number; total: number; newEmailsFound: number; invoiceCandidatesFound: number }) => void;
}): Promise<ScanResult> {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.username, pass: config.password },
        logger: false,
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        tls: { rejectUnauthorized: false },
    });

    await client.connect();

    let lock;
    try {
        lock = await client.getMailboxLock('INBOX');
        const messageUids = await client.search({
            text: idNumber,
            since: since,
        }, { uid: true });

        const emailsScanned = Array.isArray(messageUids) ? messageUids.length : 0;
        let newEmailsFound = 0;
        let invoiceCandidatesFound = 0;
        let processed = 0;
        const attachmentsToDownload: {
            uid: number;
            part: string;
            fileName: string;
            mimeType: string;
            isPoP: boolean;
            isInvoice: boolean;
        }[] = [];

        if (Array.isArray(messageUids) && messageUids.length > 0) {
            for await (const msg of client.fetch(messageUids, { envelope: true, bodyStructure: true, flags: true })) {
                processed++;
                if (!msg.flags.has('\\Seen')) {
                    newEmailsFound++;
                }

                let hasCandidate = false;
                const checkPart = (part: any) => {
                    if (!part) return;

                    const filename = part.dispositionParameters?.filename || part.parameters?.name || '';
                    const isAttachment = part.disposition?.toLowerCase() === 'attachment' || part.disposition?.toLowerCase() === 'inline' || Boolean(filename);
                    const isPdf = part.contentType?.toLowerCase() === 'application/pdf';

                    if (isAttachment && isPdf) {
                        const lowerName = filename.toLowerCase();
                        const isInvoice = lowerName.includes('invoice') || lowerName.includes('fee') || lowerName.includes('statement') || lowerName.includes('bill');
                        const isPoP = lowerName.includes('pop') || lowerName.includes('proof') || lowerName.includes('payment') || lowerName.includes('receipt') || lowerName.includes('payement');

                        if (isInvoice || isPoP) {
                            hasCandidate = true;
                            attachmentsToDownload.push({
                                uid: msg.uid,
                                part: part.part,
                                fileName: filename || (isInvoice ? 'invoice.pdf' : 'proof_of_payment.pdf'),
                                mimeType: part.contentType,
                                isPoP,
                                isInvoice,
                            });
                        }
                    }

                    if (Array.isArray(part.childNodes)) {
                        part.childNodes.forEach(checkPart);
                    }
                };

                checkPart(msg.bodyStructure);
                if (hasCandidate) {
                    invoiceCandidatesFound++;
                }

                onProgress?.({
                    processed,
                    total: emailsScanned,
                    newEmailsFound,
                    invoiceCandidatesFound,
                });
            }
        }

        const attachments: ScanResult['attachments'] = [];
        for (const att of attachmentsToDownload) {
            try {
                const { content } = await client.download(att.uid, att.part, { uid: true });
                const chunks: Buffer[] = [];
                for await (const chunk of content) {
                    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                }
                const buffer = Buffer.concat(chunks);
                attachments.push({
                    fileName: att.fileName,
                    mimeType: att.mimeType,
                    buffer,
                    isPoP: att.isPoP,
                    isInvoice: att.isInvoice,
                });
            } catch (downloadErr) {
                logger.error(`Failed to download attachment for message UID ${att.uid}:`, downloadErr);
            }
        }

        return {
            emailsScanned,
            newEmailsFound,
            invoiceCandidatesFound,
            attachments,
        };
    } finally {
        if (lock) {
            try { lock.release(); } catch { /* ignore */ }
        }
        try {
            await client.logout();
        } catch {
            /* ignore */
        }
    }
}

