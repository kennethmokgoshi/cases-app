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
    /** Folder paths that were actually searched (e.g. ["INBOX", "Sent Mail"]). */
    foldersScanned: string[];
    attachments: {
        fileName: string;
        mimeType: string;
        buffer: Buffer;
        isPoP: boolean;
        isInvoice: boolean;
        messageId?: string;
        detectedType: string;
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

export function classifyDocumentByFilename({
    filename,
    subject = '',
    isInvoice = false,
    isPoP = false,
}: {
    filename: string;
    subject?: string;
    isInvoice?: boolean;
    isPoP?: boolean;
}): string {
    const lowerName = filename.toLowerCase();
    const subjectLower = subject.toLowerCase();

    if (lowerName.includes('17.1') || lowerName.includes('17_1') || lowerName.includes('17-1')) {
        return 'FORM_17_1';
    }
    if (lowerName.includes('17.2') || lowerName.includes('17_2') || lowerName.includes('17-2')) {
        return 'FORM_17_2';
    }
    if (lowerName.includes('17.7') || lowerName.includes('17_7') || lowerName.includes('17-7')) {
        return 'FORM_17_7';
    }
    if (lowerName.includes('17.w') || lowerName.includes('17_w') || lowerName.includes('17w')) {
        return 'FORM_17W';
    }
    if (lowerName.includes('form 16') || lowerName.includes('form_16') || lowerName.includes('form-16')) {
        return 'FORM_16';
    }
    if (lowerName.includes('court order') || lowerName.includes('court_order') || lowerName.includes('order granted') || lowerName.includes('rescission')) {
        return 'COURT_ORDER';
    }
    if (lowerName.includes('credit report') || lowerName.includes('credit_report') || lowerName.includes('creditreport') || lowerName.includes('transunion') || lowerName.includes('experian') || lowerName.includes('xds') || lowerName.includes('compuscan') || lowerName.includes('lightstone') || lowerName.includes('creditprofile')) {
        if (lowerName.includes('transunion')) return 'CREDIT_REPORT_TRANSUNION';
        if (lowerName.includes('experian')) return 'CREDIT_REPORT_EXPERIAN';
        if (lowerName.includes('xds')) return 'CREDIT_REPORT_XDS';
        if (lowerName.includes('lightstone')) return 'CREDIT_REPORT_LIGHTSTONE';
        return 'CREDIT_REPORT';
    }
    if (lowerName.includes('id doc') || lowerName.includes('identity') || lowerName.includes('passport') || (lowerName.includes('id') && (lowerName.startsWith('id') || lowerName.endsWith('id') || lowerName.includes('_id') || lowerName.includes('-id')))) {
        return 'ID';
    }
    if (lowerName.includes('poa') || lowerName.includes('power of attorney') || lowerName.includes('power_of_attorney') || lowerName.includes('consent')) {
        return 'ZENOWETHU_POA';
    }
    if (lowerName.includes('payslip') || lowerName.includes('salary') || lowerName.includes('advice')) {
        return 'PAYSLIP';
    }
    if (lowerName.includes('bank statement') || lowerName.includes('bank_statement') || (lowerName.includes('statement') && lowerName.includes('bank'))) {
        return 'BANK_STATEMENT';
    }
    if (lowerName.includes('proof of residence') || lowerName.includes('proof_of_residence') || lowerName.includes('utility') || lowerName.includes('municipal') || lowerName.includes('residence')) {
        return 'PROOF_OF_RESIDENCE';
    }
    if (lowerName.includes('paid up') || lowerName.includes('paid-up') || lowerName.includes('paid_up') || lowerName.includes('settlement letter') || lowerName.includes('settled')) {
        return 'PAID_UP_LETTER';
    }
    if (isInvoice) {
        return 'FEE_INVOICE';
    }
    if (isPoP) {
        return 'PROOF_OF_PAYMENT';
    }
    return 'OTHER';
}

export function isDocTypeInGroup(detectedType: string, docGroup?: string): boolean {
    if (!docGroup || docGroup === 'ALL') return true;
    switch (docGroup) {
        case 'ID_POA':
            return ['ID', 'ZENOWETHU_POA', 'POA', 'CONSENT_FORM'].includes(detectedType);
        case 'CREDIT_REPORT':
            return ['CREDIT_REPORT', 'CREDIT_REPORT_TRANSUNION', 'CREDIT_REPORT_EXPERIAN', 'CREDIT_REPORT_XDS', 'CREDIT_REPORT_LIGHTSTONE'].includes(detectedType);
        case 'DC_INVOICE':
            return ['FEE_INVOICE', 'DC_FEE_INVOICE'].includes(detectedType);
        case 'POP':
            return ['PROOF_OF_PAYMENT'].includes(detectedType);
        case 'PAID_UP':
            return ['PAID_UP_LETTER'].includes(detectedType);
        case 'DEBT_REVIEW_FORMS':
            return ['FORM_16', 'FORM_17_1', 'FORM_17_2', 'FORM_17_7', 'FORM_17W', 'COURT_ORDER'].includes(detectedType);
        default:
            return true;
    }
}

/**
 * Categorise the raw folder paths that were searched into human-meaningful
 * buckets so activity logs can state whether Inbox and/or Sent were scanned.
 * Pure — safe to unit test without a live IMAP server.
 */
export function classifyScannedFolders(folders: string[]): {
    scannedInbox: boolean;
    scannedSent: boolean;
    folders: string[];
} {
    const scannedInbox = folders.some(f => f.trim().toLowerCase() === 'inbox');
    const scannedSent = folders.some(f => /sent/i.test(f));
    return { scannedInbox, scannedSent, folders };
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
    onFoldersResolved,
    skipMessageIds = [],
    docGroup = 'ALL',
}: {
    config: ImapConnectionConfig;
    idNumber: string;
    since: Date;
    onProgress?: (stats: { processed: number; total: number; newEmailsFound: number; invoiceCandidatesFound: number }) => void;
    /** Called once the folders for this mailbox are resolved (e.g. INBOX, Sent),
     *  so callers can record which folders were actually scanned. */
    onFoldersResolved?: (folders: string[]) => void;
    skipMessageIds?: string[];
    docGroup?: string;
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
        onFoldersResolved?.(folders);
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
            detectedType: string;
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
                                    const detectedType = classifyDocumentByFilename({
                                        filename,
                                        subject: subjectLower,
                                        isInvoice,
                                        isPoP,
                                    });

                                    if (isDocTypeInGroup(detectedType, docGroup)) {
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
                                            detectedType,
                                        });
                                    }
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
                    detectedType: att.detectedType,
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
            foldersScanned: folders,
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

export async function getEmailBodyText(client: ImapFlow, uid: number, bodyStructure: any): Promise<string> {
    const textParts: { part: string; mimeType: string }[] = [];

    function findTextParts(part: any) {
        if (!part) return;
        const contentType = (part.contentType || part.type || '').toLowerCase();
        if (contentType === 'text/plain' || contentType === 'text/html') {
            textParts.push({ part: part.part, mimeType: contentType });
        }
        if (Array.isArray(part.childNodes)) {
            for (const child of part.childNodes) {
                findTextParts(child);
            }
        }
    }

    findTextParts(bodyStructure);
    if (textParts.length === 0) return '';

    // Prefer text/plain, then text/html
    const bestPart = textParts.find(p => p.mimeType === 'text/plain') || textParts[0];
    if (!bestPart) return '';

    try {
        const { content } = await client.download(uid, bestPart.part, { uid: true });
        const chunks: Buffer[] = [];
        for await (const chunk of content) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const text = Buffer.concat(chunks).toString('utf-8');

        if (bestPart.mimeType === 'text/html') {
            return text
                .replace(/<style([\s\S]*?)<\/style>/gi, '')
                .replace(/<script([\s\S]*?)<\/script>/gi, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
        return text.trim();
    } catch (err) {
        logger.warn(`[IMAP] Failed to download body text for UID ${uid} part ${bestPart.part}:`, err);
        return '';
    }
}

export interface CaseEmailUpdate {
    messageId: string;
    from: string;
    to: string;
    subject: string;
    date: string | null;
    body: string;
    folder: string;
    uid: number;
    attachments: {
        fileName: string;
        mimeType: string;
        buffer: Buffer;
        detectedType: string;
    }[];
}

export async function scanMailboxForCaseUpdates({
    config,
    idNumber,
    firstName,
    lastName,
    since,
    limit = 10,
    skipMessageIds = [],
    onFoldersResolved,
}: {
    config: ImapConnectionConfig;
    idNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    since: Date;
    limit?: number;
    skipMessageIds?: string[];
    /** Called once the folders for this mailbox are resolved (e.g. INBOX, Sent),
     *  so callers can record which folders were actually scanned. */
    onFoldersResolved?: (folders: string[]) => void;
}): Promise<CaseEmailUpdate[]> {
    const trimmedId = asString(idNumber);
    const trimmedFirst = asString(firstName);
    const trimmedLast = asString(lastName);
    const fullName = trimmedFirst && trimmedLast ? `${trimmedFirst} ${trimmedLast}` : null;

    if (!trimmedId && !fullName) {
        return [];
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

    await client.connect();

    try {
        const folders = await getSearchFolders(client);
        onFoldersResolved?.(folders);
        const updates: CaseEmailUpdate[] = [];
        const processedMessageIds = new Set<string>(skipMessageIds);

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
                const uidsToFetch = allUids.sort((a, b) => b - a).slice(0, limit);

                if (uidsToFetch.length > 0) {
                    for await (const msg of client.fetch(uidsToFetch, { uid: true, envelope: true, bodyStructure: true, flags: true })) {
                        const messageId = msg.envelope?.messageId || '';
                        if (messageId && processedMessageIds.has(messageId)) {
                            continue;
                        }
                        if (messageId) {
                            processedMessageIds.add(messageId);
                        }

                        // Download the body text
                        const body = await getEmailBodyText(client, msg.uid, msg.bodyStructure);

                        // Find and download attachments (PDFs, images, docs)
                        const attachments: CaseEmailUpdate['attachments'] = [];
                        const checkAndDownloadParts = async (part: any) => {
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
                                try {
                                    const { content } = await client.download(msg.uid, part.part, { uid: true });
                                    const chunks: Buffer[] = [];
                                    for await (const chunk of content) {
                                        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                                    }
                                    const buffer = Buffer.concat(chunks);
                                    const lowerName = filename.toLowerCase();
                                    const isInvoice = lowerName.includes('invoice') || lowerName.includes('fee') || lowerName.includes('statement') || lowerName.includes('bill');
                                    const isPoP = lowerName.includes('pop') || lowerName.includes('proof') || lowerName.includes('payment') || lowerName.includes('receipt') || lowerName.includes('payement');
                                    const detectedType = classifyDocumentByFilename({
                                        filename,
                                        subject: msg.envelope?.subject || '',
                                        isInvoice,
                                        isPoP,
                                    });

                                    attachments.push({
                                        fileName: filename || (isInvoice ? 'invoice.pdf' : isPoP ? 'proof_of_payment.pdf' : 'document.pdf'),
                                        mimeType: part.contentType || (isPdf ? 'application/pdf' : 'application/octet-stream'),
                                        buffer,
                                        detectedType,
                                    });
                                } catch (downloadErr) {
                                    logger.error(`Failed to download attachment ${filename} for message UID ${msg.uid} in folder ${folder}:`, downloadErr);
                                }
                            }

                            if (Array.isArray(part.childNodes)) {
                                for (const child of part.childNodes) {
                                    await checkAndDownloadParts(child);
                                }
                            }
                        };

                        await checkAndDownloadParts(msg.bodyStructure);

                        let dateStr: string | null = null;
                        if (msg.envelope?.date) {
                            const d = msg.envelope.date instanceof Date ? msg.envelope.date : new Date(msg.envelope.date);
                            dateStr = Number.isNaN(d.getTime()) ? null : d.toISOString();
                        }

                        updates.push({
                            messageId,
                            from: formatAddressList(msg.envelope?.from),
                            to: formatAddressList(msg.envelope?.to),
                            subject: msg.envelope?.subject || '(no subject)',
                            date: dateStr,
                            body,
                            folder,
                            uid: msg.uid,
                            attachments,
                        });
                    }
                }
            } catch (folderErr) {
                logger.warn(`Failed to scan folder ${folder} for updates:`, folderErr);
            } finally {
                if (lock) {
                    try { lock.release(); } catch { /* ignore */ }
                }
            }
        }

        updates.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        return updates.slice(0, limit);
    } finally {
        try {
            await client.logout();
        } catch {
            /* ignore */
        }
    }
}

