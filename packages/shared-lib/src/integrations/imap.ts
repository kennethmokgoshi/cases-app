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
        messageId?: string;
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

async function getSearchFolders(client: ImapFlow): Promise<string[]> {
    try {
        const list = await client.list();
        if (!list || list.length === 0) return ['INBOX'];

        const folders: string[] = [];
        // Prioritize INBOX first if selectable
        const inbox = list.find(m => m.path === 'INBOX' || m.path.toLowerCase() === 'inbox');
        if (inbox && (!inbox.flags || !inbox.flags.has('\\Noselect'))) {
            folders.push(inbox.path);
        }

        for (const m of list) {
            // Skip non-selectable folders (folders that are purely parent categories without messages)
            if (m.flags && m.flags.has('\\Noselect')) {
                continue;
            }
            if (m.path && !folders.includes(m.path)) {
                folders.push(m.path);
            }
        }
        return folders.length > 0 ? folders : ['INBOX'];
    } catch {
        return ['INBOX'];
    }
}

/**
 * Search a single mailbox for any message referencing a consumer by
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

    try {
        await client.connect();
        const folders = await getSearchFolders(client);
        const matches: ConsumerEmailMatch[] = [];
        let totalScanned = 0;

        for (const folder of folders) {
            let lock;
            try {
                lock = await client.getMailboxLock(folder);

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
                totalScanned += allUids.length;
                const uidsToFetch = allUids.sort((a, b) => b - a).slice(0, limit);

                if (uidsToFetch.length > 0) {
                    for await (const msg of client.fetch(uidsToFetch, { uid: true, envelope: true, flags: true })) {
                        const keys = [...(matchedOnByUid.get(msg.uid) ?? [])];
                        matches.push(mapEnvelopeToMatch(mailboxLabel, msg, keys));
                    }
                }
            } catch (folderErr) {
                logger.warn(`[IMAP] Consumer search failed for folder ${folder}:`, folderErr);
            } finally {
                if (lock) {
                    try { lock.release(); } catch { /* ignore */ }
                }
            }
        }

        matches.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        return { mailbox: mailboxLabel, scanned: totalScanned, matches: matches.slice(0, limit) };
    } catch (err: unknown) {
        const error = formatImapConnectionError(err, config);
        logger.warn(`[IMAP] Consumer search failed for ${config.username}@${config.host}: ${error}`);
        return { mailbox: mailboxLabel, scanned: 0, matches: [], error };
    } finally {
        try { await client.logout(); } catch { /* ignore */ }
    }
}

export async function scanMailboxForClient({
    config,
    idNumber,
    since,
    onProgress,
    skipMessageIds = [],
}: {
    config: ImapConnectionConfig;
    idNumber: string;
    since: Date;
    onProgress?: (stats: { processed: number; total: number; newEmailsFound: number; invoiceCandidatesFound: number }) => void;
    skipMessageIds?: string[];
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

    try {
        const folders = await getSearchFolders(client);
        let emailsScanned = 0;
        let newEmailsFound = 0;
        let invoiceCandidatesFound = 0;
        let processed = 0;
        const attachmentsToDownload: {
            folder: string;
            uid: number;
            part: string;
            fileName: string;
            mimeType: string;
            isPoP: boolean;
            isInvoice: boolean;
            messageId: string;
        }[] = [];

        const processedMessageIds = new Set<string>(skipMessageIds);

        for (const folder of folders) {
            let lock;
            try {
                lock = await client.getMailboxLock(folder);
                const messageUids = await client.search({
                    text: idNumber,
                    since: since,
                }, { uid: true });

                if (Array.isArray(messageUids) && messageUids.length > 0) {
                    emailsScanned += messageUids.length;

                    for await (const msg of client.fetch(messageUids, { envelope: true, bodyStructure: true, flags: true })) {
                        processed++;

                        const messageId = msg.envelope?.messageId || '';
                        if (messageId && processedMessageIds.has(messageId)) {
                            continue;
                        }
                        if (messageId) {
                            processedMessageIds.add(messageId);
                        }

                        if (!msg.flags.has('\\Seen')) {
                            newEmailsFound++;
                        }

                        const subjectLower = (msg.envelope?.subject || '').toLowerCase();
                        let hasCandidate = false;

                        const checkPart = (part: any) => {
                            if (!part) return;

                            const filename =
                                part.filename ||
                                part.name ||
                                part.dispositionParameters?.filename ||
                                part.dispositionParameters?.FILENAME ||
                                part.parameters?.name ||
                                part.parameters?.NAME ||
                                '';
                            const mimeType = (part.contentType || part.type || '').toLowerCase();
                            const isPdf = mimeType === 'application/pdf' || mimeType.includes('pdf');
                            const isImage = mimeType.startsWith('image/');
                            const isDoc = isPdf || isImage || mimeType === 'application/octet-stream' || mimeType.includes('document') || mimeType.includes('sheet');
                            const isAttachment =
                                part.disposition?.toLowerCase() === 'attachment' ||
                                part.disposition?.toLowerCase() === 'inline' ||
                                Boolean(filename) ||
                                isPdf;

                            if ((isAttachment || Boolean(filename)) && isDoc) {
                                const lowerName = filename.toLowerCase();
                                const isInvoice = lowerName.includes('invoice') || lowerName.includes('fee') || lowerName.includes('statement') || lowerName.includes('bill') || subjectLower.includes('invoice') || subjectLower.includes('fee') || subjectLower.includes('consumer');
                                const isPoP = lowerName.includes('pop') || lowerName.includes('proof') || lowerName.includes('payment') || lowerName.includes('receipt') || lowerName.includes('payement') || subjectLower.includes('proof') || subjectLower.includes('payment') || subjectLower.includes('pop');
                                const isCandidateDoc = isInvoice || isPoP || isPdf || Boolean(filename);

                                if (isCandidateDoc) {
                                    hasCandidate = true;
                                    attachmentsToDownload.push({
                                        folder,
                                        uid: msg.uid,
                                        part: part.part,
                                        fileName: filename || (isInvoice ? 'invoice.pdf' : isPoP ? 'proof_of_payment.pdf' : 'document.pdf'),
                                        mimeType: part.contentType || (isPdf ? 'application/pdf' : 'application/octet-stream'),
                                        isPoP,
                                        isInvoice: isInvoice || !isPoP,
                                        messageId,
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
            } catch (folderErr) {
                logger.warn(`Failed to scan folder ${folder} for ${config.username}:`, folderErr);
            } finally {
                if (lock) {
                    try { lock.release(); } catch { /* ignore */ }
                }
            }
        }

        const attachments: ScanResult['attachments'] = [];
        for (const att of attachmentsToDownload) {
            let lockFolder;
            try {
                lockFolder = await client.getMailboxLock(att.folder);
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
                    messageId: att.messageId,
                });
            } catch (downloadErr) {
                logger.error(`Failed to download attachment for message UID ${att.uid} in folder ${att.folder}:`, downloadErr);
            } finally {
                if (lockFolder) {
                    try { lockFolder.release(); } catch { /* ignore */ }
                }
            }
        }

        return {
            emailsScanned,
            newEmailsFound,
            invoiceCandidatesFound,
            attachments,
        };
    } finally {
        try {
            await client.logout();
        } catch {
            /* ignore */
        }
    }
}

