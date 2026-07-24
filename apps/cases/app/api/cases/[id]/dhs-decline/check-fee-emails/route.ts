import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, getSMTPCredentials } from '@zenowethu/shared-lib';
import { scanMailboxForClient, classifyScannedFolders } from '@zenowethu/shared-lib/src/integrations/imap';
import { decryptSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { z } from 'zod';
import { isUsableMailboxPassword, usesSmtpPassword } from '@/lib/mailboxes';
import { getSmtpUsernameIfConfigured } from '@/lib/mailbox-smtp';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import crypto from 'crypto';

const logger = createLogger('api/cases/[id]/dhs-decline/check-fee-emails');

const BodySchema = z.object({
    lookbackDays: z.coerce.number().int().min(1).max(1095).default(365),
    receivedAfter: z.coerce.date().optional(),
    reason: z.string().trim().max(1000).optional(),
    // 'ALL' (default) searches every mailbox the caller may use; otherwise a MailboxAccount id
    mailboxId: z.string().trim().min(1).default('ALL'),
    docGroup: z.string().trim().default('ALL'),
});

const ACTIVITY_TYPE = 'DHS_FEE_EMAIL_SCAN_REQUESTED';
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SearchableMailbox {
    id: string;
    label: string;
    emailAddress: string;
    isDcCommunication: boolean;
    hasPassword: boolean;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    password: string | null;
}

interface InvoiceEmailScanSummary {
    status: 'QUEUED' | 'DUPLICATE' | 'NOT_CONFIGURED' | 'COMPLETED';
    searchFrom: string;
    idNumberMatchRequired: boolean;
    idNumberMatchValue: string;
    selectedMailboxCount: number;
    readableMailboxCount: number;
    skippedMailboxCount: number;
    emailsScanned: number | null;
    newEmailsFound: number | null;
    invoiceCandidatesFound: number | null;
    uploadedDocuments: number | null;
    note: string;
}

interface InvoiceEmailMatchPolicy {
    requiredIdentifierType: 'CLIENT_ID_NUMBER';
    requiredIdentifierValue: string;
    serverSideSearchRequired: true;
    openOrFetchOnlyAfterIdentifierMatch: true;
    nonMatchingEmailAction: 'SKIP_WITHOUT_OPENING';
}

// Mailboxes this user may search: active shared inboxes + their own personal one.
// A mailbox matching the Email (SMTP) Account login reuses its saved password.
async function getSearchableMailboxes(userId: string): Promise<SearchableMailbox[]> {
    const [rows, smtpUsername] = await Promise.all([
        prisma.mailboxAccount.findMany({
            where: {
                isActive: true,
                OR: [{ ownerUserId: null }, { ownerUserId: userId }],
            },
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
    ]);
    return rows.map(rest => ({
        ...rest,
        hasPassword: isUsableMailboxPassword(rest.password) || usesSmtpPassword(rest.emailAddress, rest.password, smtpUsername),
    }));
}

// Legacy env-based single-inbox configuration still counts as configured
function isEnvMailboxConfigured(): boolean {
    return Boolean(
        process.env.DC_FEE_INBOX_PROVIDER ||
        process.env.DC_FEE_INBOX_IMAP_HOST ||
        process.env.DC_FEE_INBOX_GRAPH_TENANT_ID ||
        process.env.DC_FEE_INBOX_GMAIL_CLIENT_ID
    );
}

function formatDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function buildPendingScanSummary({
    status,
    searchFrom,
    idNumber,
    selectedMailboxes,
    configuredMailboxes,
    emailsScanned = null,
    newEmailsFound = null,
    invoiceCandidatesFound = null,
    uploadedDocuments = null,
}: {
    status: InvoiceEmailScanSummary['status'];
    searchFrom: Date;
    idNumber: string;
    selectedMailboxes: SearchableMailbox[];
    configuredMailboxes: SearchableMailbox[];
    emailsScanned?: number | null;
    newEmailsFound?: number | null;
    invoiceCandidatesFound?: number | null;
    uploadedDocuments?: number | null;
}): InvoiceEmailScanSummary {
    const skippedMailboxCount = selectedMailboxes.length - configuredMailboxes.length;
    const note = status === 'DUPLICATE'
        ? 'A matching scan request already exists for this case and mailbox selection in the last 24 hours.'
        : status === 'NOT_CONFIGURED'
            ? 'No selected mailbox has saved credentials yet, so no emails can be read.'
            : status === 'COMPLETED'
                ? 'Scan completed. Found documents have been attached to the case.'
                : 'Mailbox credentials are saved. Email scanned/found/uploaded counts will appear after the inbox worker processes this request.';

    return {
        status,
        searchFrom: searchFrom.toISOString(),
        idNumberMatchRequired: true,
        idNumberMatchValue: idNumber,
        selectedMailboxCount: selectedMailboxes.length,
        readableMailboxCount: configuredMailboxes.length,
        skippedMailboxCount,
        emailsScanned,
        newEmailsFound,
        invoiceCandidatesFound,
        uploadedDocuments,
        note,
    };
}

function buildMatchPolicy(idNumber: string): InvoiceEmailMatchPolicy {
    return {
        requiredIdentifierType: 'CLIENT_ID_NUMBER',
        requiredIdentifierValue: idNumber,
        serverSideSearchRequired: true,
        openOrFetchOnlyAfterIdentifierMatch: true,
        nonMatchingEmailAction: 'SKIP_WITHOUT_OPENING',
    };
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: caseId } = await params;
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                declineReason: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        email: true,
                    },
                },
            },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Who is running this scan — recorded on the activity so the journal (and
        // the pre-run confirmation modal) can show exactly who ran it and when.
        const runByUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { firstName: true, lastName: true, email: true },
        });
        const runByName = runByUser
            ? (`${runByUser.firstName ?? ''} ${runByUser.lastName ?? ''}`.trim() || runByUser.email || 'Unknown user')
            : 'Unknown user';
        const runBy = {
            id: session.user.id,
            name: runByName,
            email: runByUser?.email ?? null,
        };

        const { lookbackDays, receivedAfter, reason, mailboxId, docGroup } = parsed.data;
        const idNumber = caseData.client.idNumber?.trim();
        if (!idNumber) {
            return NextResponse.json(
                { error: 'Cannot check invoice emails until the client ID number is saved on the case.' },
                { status: 422 }
            );
        }

        const searchable = await getSearchableMailboxes(session.user.id);
        let selectedMailboxes: SearchableMailbox[];
        if (mailboxId === 'ALL') {
            selectedMailboxes = searchable;
        } else {
            const match = searchable.find(m => m.id === mailboxId);
            if (!match) {
                return NextResponse.json(
                    { error: 'Mailbox not found, inactive, or not available to you' },
                    { status: 404 }
                );
            }
            selectedMailboxes = [match];
        }

        const searchFrom = receivedAfter ?? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const configuredMailboxes = selectedMailboxes.filter(m => m.hasPassword);
        const inboxConfigured = configuredMailboxes.length > 0 || isEnvMailboxConfigured();
        const matchPolicy = buildMatchPolicy(idNumber);

        // Duplicate guard is per mailbox scope, so checking a second mailbox on
        // the same day is allowed. Old requests without the strict ID-number
        // match policy are deliberately superseded by a new safe request.
        const scopeKey = mailboxId;
        const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_MS);
        const recentRequests = await prisma.caseComment.findMany({
            where: {
                caseId,
                activityType: ACTIVITY_TYPE,
                createdAt: { gte: duplicateSince },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, createdAt: true, activityData: true },
        });
        const existingRequest = recentRequests.find(r => {
            try {
                const data = JSON.parse(r.activityData ?? '{}');
                const hasStrictMatchPolicy =
                    data.matchPolicy?.requiredIdentifierType === matchPolicy.requiredIdentifierType &&
                    data.matchPolicy?.requiredIdentifierValue === matchPolicy.requiredIdentifierValue &&
                    data.matchPolicy?.serverSideSearchRequired === true &&
                    data.matchPolicy?.openOrFetchOnlyAfterIdentifierMatch === true &&
                    data.matchPolicy?.nonMatchingEmailAction === matchPolicy.nonMatchingEmailAction;
                const sameReceivedAfter = !data.receivedAfter || data.receivedAfter === searchFrom.toISOString();
                const sameDocGroup = (data.docGroup ?? 'ALL') === docGroup;
                return (data.mailboxScope ?? 'ALL') === scopeKey && hasStrictMatchPolicy && sameReceivedAfter && sameDocGroup;
            } catch {
                return false;
            }
        });

        const encoder = new TextEncoder();

        if (existingRequest) {
            let scanSummaryVal = buildPendingScanSummary({
                status: 'DUPLICATE',
                searchFrom,
                idNumber,
                selectedMailboxes,
                configuredMailboxes,
            });
            try {
                const existingData = JSON.parse(existingRequest.activityData ?? '{}');
                if (existingData.scanSummary) {
                    scanSummaryVal = {
                        ...scanSummaryVal,
                        ...existingData.scanSummary,
                        status: 'DUPLICATE',
                    };
                }
            } catch {
                // Ignore
            }
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(JSON.stringify({
                        type: 'complete',
                        data: {
                            success: true,
                            duplicate: true,
                            scanQueued: false,
                            inboxConfigured,
                            activityId: existingRequest.id,
                            mailboxes: selectedMailboxes.map(m => ({
                                id: m.id,
                                emailAddress: m.emailAddress,
                                isDcCommunication: m.isDcCommunication,
                                configured: m.hasPassword,
                            })),
                            scanSummary: scanSummaryVal,
                            message: `An email search for ${docGroup === 'ALL' ? 'all documents' : docGroup === 'ID_POA' ? 'ID & POA' : docGroup === 'CREDIT_REPORT' ? 'credit reports' : docGroup} was already performed for this case in the last 24 hours.`,
                        }
                    }) + '\n'));
                    controller.close();
                }
            });
            return new Response(stream, {
                headers: {
                    'Content-Type': 'application/x-ndjson',
                    'Cache-Control': 'no-cache, no-transform',
                }
            });
        }

        const clientName = `${caseData.client.firstName} ${caseData.client.lastName}`.trim();

        const stream = new ReadableStream({
            async start(controller) {
                const send = (data: any) => {
                    controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
                };

                try {
                    let emailsScanned = 0;
                    let newEmailsFound = 0;
                    let invoiceCandidatesFound = 0;
                    const savedDocuments: string[] = [];
                    const mailboxErrors: string[] = [];
                    const foldersScannedSet = new Set<string>();

                    if (inboxConfigured && configuredMailboxes.length > 0) {
                        const systemUser = await prisma.user.findFirst({
                            where: {
                                OR: [
                                    { id: session.user.id },
                                    { role: 'ADMIN' },
                                ],
                            },
                        });
                        const uploadDir = join(process.cwd(), 'storage', 'uploads', caseId);
                        const totalMbx = configuredMailboxes.length;

                        for (let i = 0; i < totalMbx; i++) {
                            const mailbox = configuredMailboxes[i];
                            const baseProgress = Math.round((i / totalMbx) * 100);
                            send({
                                type: 'progress',
                                progress: baseProgress,
                                emailsScanned,
                                newEmailsFound,
                            });

                            let password: string | null = null;
                            if (mailbox.password) {
                                try {
                                    password = decryptSecret(mailbox.password);
                                } catch (err: any) {
                                    logger.warn(`Failed to decrypt password for mailbox ${mailbox.emailAddress}:`, err);
                                    password = null;
                                }
                            }
                            if (!password) {
                                try {
                                    const smtp = await getSMTPCredentials();
                                    if (usesSmtpPassword(mailbox.emailAddress, password, smtp.password ? smtp.username : null)) {
                                        password = smtp.password;
                                    }
                                } catch {
                                    // ignore
                                }
                            }

                            if (!password) {
                                mailboxErrors.push(`${mailbox.emailAddress}: No valid password saved (or saved password could not be decrypted)`);
                                continue;
                            }

                            try {
                                // Fetch already processed message IDs from ProcessedMailboxMessage for this mailbox
                                const processedMessages = await prisma.processedMailboxMessage.findMany({
                                    where: { mailboxAccountId: mailbox.id },
                                    select: { messageId: true }
                                });
                                const skipMessageIds = processedMessages.map(m => m.messageId);

                                const scanResult = await scanMailboxForClient({
                                    config: {
                                        host: mailbox.imapHost,
                                        port: mailbox.imapPort,
                                        secure: mailbox.imapSecure,
                                        username: mailbox.emailAddress,
                                        password,
                                    },
                                    idNumber,
                                    since: searchFrom,
                                    skipMessageIds,
                                    docGroup,
                                    onFoldersResolved: (folders) => {
                                        folders.forEach(f => foldersScannedSet.add(f));
                                    },
                                    onProgress: (p) => {
                                        const mbxProgress = p.total ? (p.processed / p.total) : 0.5;
                                        const totalProgress = Math.round(((i + mbxProgress) / totalMbx) * 100);
                                        send({
                                            type: 'progress',
                                            progress: Math.min(totalProgress, 99),
                                            emailsScanned: emailsScanned + p.processed,
                                            newEmailsFound: newEmailsFound + p.newEmailsFound,
                                        });
                                    }
                                });

                                emailsScanned += scanResult.emailsScanned;
                                newEmailsFound += scanResult.newEmailsFound;
                                invoiceCandidatesFound += scanResult.invoiceCandidatesFound;

                                if (scanResult.attachments.length > 0) {
                                    try {
                                        await mkdir(uploadDir, { recursive: true });
                                    } catch {
                                        // Directory creation warning/ignored
                                    }
                                    for (const att of scanResult.attachments) {
                                        // Compute SHA-256 hash of attachment
                                        const hash = crypto.createHash('sha256').update(att.buffer).digest('hex');

                                        // Verify if the document already exists in this case to avoid duplicates
                                        const existingDoc = await prisma.document.findFirst({
                                            where: {
                                                caseId,
                                                fileSize: att.buffer.length,
                                                fileName: att.fileName,
                                            }
                                        });
                                        if (existingDoc) {
                                            continue; // Skip already downloaded document
                                        }

                                        const safeName = att.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                                        const uniqueFileName = `${Date.now()}-${safeName}`;
                                        try {
                                            await writeFile(join(uploadDir, uniqueFileName), att.buffer);
                                        } catch (wErr) {
                                            logger.warn(`Could not save attachment file ${uniqueFileName}:`, wErr);
                                        }

                                        const fileUrl = `/uploads/${caseId}/${uniqueFileName}`;
                                        const docType = att.detectedType && att.detectedType !== 'OTHER'
                                            ? att.detectedType
                                            : (att.isInvoice ? 'FEE_INVOICE' : 'PROOF_OF_PAYMENT');

                                        await prisma.document.create({
                                            data: {
                                                caseId,
                                                type: docType,
                                                fileName: att.fileName,
                                                fileUrl,
                                                fileSize: att.buffer.length,
                                                mimeType: att.mimeType,
                                                uploadedById: systemUser?.id || session.user.id,
                                            },
                                        });
                                        savedDocuments.push(fileUrl);

                                        // Record that this messageId and attachment hash has been processed
                                        if (att.messageId) {
                                            await prisma.processedMailboxMessage.upsert({
                                                where: {
                                                    mailboxAccountId_messageId: {
                                                        mailboxAccountId: mailbox.id,
                                                        messageId: att.messageId,
                                                    }
                                                },
                                                update: {
                                                    attachmentHash: hash
                                                },
                                                create: {
                                                    mailboxAccountId: mailbox.id,
                                                    messageId: att.messageId,
                                                    attachmentHash: hash
                                                }
                                            });
                                        }
                                    }
                                }
                            } catch (err: any) {
                                logger.error(`Error scanning mailbox ${mailbox.emailAddress}:`, err);
                                mailboxErrors.push(`${mailbox.emailAddress}: ${err.message || String(err)}`);
                            }
                        }
                    }

                    const scanStatus = inboxConfigured
                        ? (mailboxErrors.length === configuredMailboxes.length && configuredMailboxes.length > 0 ? 'NOT_CONFIGURED' : 'COMPLETED')
                        : 'NOT_CONFIGURED';

                    const scanSummary = buildPendingScanSummary({
                        status: scanStatus,
                        searchFrom,
                        idNumber,
                        selectedMailboxes,
                        configuredMailboxes,
                        emailsScanned: inboxConfigured ? emailsScanned : null,
                        newEmailsFound: inboxConfigured ? newEmailsFound : null,
                        invoiceCandidatesFound: inboxConfigured ? invoiceCandidatesFound : null,
                        uploadedDocuments: inboxConfigured ? savedDocuments.length : null,
                    });

                    if (mailboxErrors.length > 0) {
                        scanSummary.note += ` Mailbox errors: ${mailboxErrors.join('; ')}`;
                    }

                    const foldersScanned = [...foldersScannedSet];
                    const { scannedInbox, scannedSent } = classifyScannedFolders(foldersScanned);

                    const activityData = {
                        action: 'CHECK_DC_FEE_INVOICE_EMAILS',
                        caseId,
                        fileNumber: caseData.fileNumber,
                        clientName,
                        idNumber,
                        runBy,
                        matchPolicy,
                        lookbackDays,
                        receivedAfter: searchFrom.toISOString(),
                        mailboxScope: scopeKey,
                        docGroup,
                        mailboxes: selectedMailboxes.map(m => ({
                            id: m.id,
                            emailAddress: m.emailAddress,
                            isDcCommunication: m.isDcCommunication,
                            configured: m.hasPassword,
                        })),
                        mailboxConfigured: inboxConfigured,
                        foldersScanned,
                        scannedInbox,
                        scannedSent,
                        scanSummary,
                    };

                    const mailboxSummary = selectedMailboxes.length > 0
                        ? selectedMailboxes
                            .map(m => `${m.emailAddress}${m.isDcCommunication ? ' (DC comms)' : ''}${m.hasPassword ? '' : ' — no password saved'}`)
                            .join(', ')
                        : 'none registered';

                    const emailCountsLine = scanStatus === 'COMPLETED'
                        ? `Email counts: ${emailsScanned} scanned, ${newEmailsFound} new, ${invoiceCandidatesFound} invoice/PoP candidates, ${savedDocuments.length} documents uploaded.`
                        : 'Email counts: pending inbox worker (emails scanned/found/uploaded not available yet).';

                    const configLine = scanStatus === 'COMPLETED'
                        ? `Scan completed successfully. Saved documents: ${savedDocuments.length} file(s) attached.`
                        : inboxConfigured
                            ? 'Mailbox credentials are saved; the inbox worker can match DC invoice replies and proof-of-payment replies to this case.'
                            : 'No mailbox has a saved password yet; ask Admin to set mailbox passwords in Admin → Settings before the app can read the inbox automatically.';

                    const foldersLine = scanStatus === 'COMPLETED'
                        ? (foldersScanned.length > 0
                            ? `Folders scanned: ${foldersScanned.join(', ')} (Inbox: ${scannedInbox ? 'yes' : 'no'}, Sent: ${scannedSent ? 'yes' : 'no'}).`
                            : 'Folders scanned: none (no readable mailbox returned any folders).')
                        : 'Folders scanned: pending inbox worker.';

                    const content = [
                        `Search Email for ${docGroup === 'ALL' ? 'all documents' : docGroup === 'ID_POA' ? 'ID/POA' : docGroup === 'CREDIT_REPORT' ? 'Credit Report' : docGroup} run by ${runByName} for ${clientName} (${caseData.client.idNumber}).`,
                        `Search from: ${formatDateOnly(searchFrom)}.`,
                        `Strict match rule: only emails containing client ID number ${idNumber} may be opened/read; non-matching emails must be skipped unopened.`,
                        `Mailboxes: ${mailboxId === 'ALL' ? `all (${mailboxSummary})` : mailboxSummary}.`,
                        `Mailbox summary: ${selectedMailboxes.length} selected, ${configuredMailboxes.length} readable, ${selectedMailboxes.length - configuredMailboxes.length} skipped.`,
                        foldersLine,
                        emailCountsLine,
                        configLine,
                        mailboxErrors.length > 0 ? `Errors: ${mailboxErrors.join('; ')}` : null,
                        reason ? `Decline reason: ${reason}` : null,
                    ].filter((line): line is string => Boolean(line)).join('\n');

                    const [comment] = await Promise.all([
                        prisma.caseComment.create({
                            data: {
                                caseId,
                                userId: session.user.id,
                                content,
                                type: 'NOTE',
                                isInternal: true,
                                activityType: ACTIVITY_TYPE,
                                activityData: JSON.stringify(activityData),
                            },
                            select: { id: true },
                        }),
                        prisma.workflowLog.create({
                            data: {
                                caseId,
                                fromStatus: caseData.status,
                                toStatus: caseData.status,
                                action: ACTIVITY_TYPE,
                                userId: session.user.id,
                                notes: content,
                            },
                        }),
                    ]);

                    logger.info('[DHS fee email check] Completed synchronously', {
                        caseId,
                        fileNumber: caseData.fileNumber,
                        userId: session.user.id,
                        mailboxScope: scopeKey,
                        mailboxCount: selectedMailboxes.length,
                        inboxConfigured,
                        scanStatus,
                        emailsScanned,
                        savedDocuments: savedDocuments.length,
                    });

                    send({
                        type: 'complete',
                        data: {
                            success: true,
                            duplicate: false,
                            scanQueued: false,
                            inboxConfigured,
                            activityId: comment.id,
                            runBy,
                            ranAt: new Date().toISOString(),
                            mailboxes: activityData.mailboxes,
                            foldersScanned,
                            scannedInbox,
                            scannedSent,
                            matchPolicy,
                            scanSummary,
                            message: scanStatus === 'COMPLETED'
                                ? `Fee-invoice email check completed. Scanned ${emailsScanned} email(s), found ${invoiceCandidatesFound} invoice/PoP candidate(s), uploaded ${savedDocuments.length} document(s).`
                                : 'Fee-invoice email check logged. Save mailbox passwords in Admin → Settings before the app can read emails automatically.',
                        }
                    });
                    controller.close();
                } catch (err: any) {
                    logger.error('Error during fee-invoice email check stream:', err);
                    send({ type: 'error', error: err.message || String(err) });
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            }
        });
    } catch (error) {
        logger.error('Error requesting fee-invoice email check:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Returns the most recent "Search Email" scan for this case (optionally filtered
// by docGroup) so the UI can show a pre-run confirmation: who ran it, when, which
// mailboxes/folders were scanned, and the result summary — before running again.
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (session.user.userType === 'B2B_PARTNER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: caseId } = await params;
        const url = new URL(request.url);
        const docGroup = (url.searchParams.get('docGroup') || 'ALL').trim();

        const recent = await prisma.caseComment.findMany({
            where: { caseId, activityType: ACTIVITY_TYPE },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: {
                id: true,
                createdAt: true,
                content: true,
                activityData: true,
                user: { select: { firstName: true, lastName: true, email: true } },
            },
        });

        const match = recent.find(r => {
            try {
                const data = JSON.parse(r.activityData ?? '{}');
                return (data.docGroup ?? 'ALL') === docGroup;
            } catch {
                return false;
            }
        });

        if (!match) {
            return NextResponse.json({ found: false, docGroup });
        }

        let data: any = {};
        try {
            data = JSON.parse(match.activityData ?? '{}');
        } catch {
            data = {};
        }

        const runByName = data.runBy?.name
            || (match.user ? `${match.user.firstName ?? ''} ${match.user.lastName ?? ''}`.trim() || match.user.email : null)
            || 'Unknown user';

        return NextResponse.json({
            found: true,
            docGroup,
            activityId: match.id,
            ranAt: match.createdAt,
            runByName,
            runByEmail: data.runBy?.email ?? match.user?.email ?? null,
            mailboxes: Array.isArray(data.mailboxes) ? data.mailboxes : [],
            foldersScanned: Array.isArray(data.foldersScanned) ? data.foldersScanned : [],
            scannedInbox: data.scannedInbox ?? null,
            scannedSent: data.scannedSent ?? null,
            scanSummary: data.scanSummary ?? null,
            content: match.content ?? null,
        });
    } catch (error) {
        logger.error('Error fetching most recent email scan:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

