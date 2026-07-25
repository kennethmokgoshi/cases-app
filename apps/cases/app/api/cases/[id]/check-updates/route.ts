import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { scanMailboxForCaseUpdates } from '@zenowethu/shared-lib/src/integrations/imap';
import { analyzeEmailForCaseUpdate } from '@zenowethu/shared-lib/src/ai/case-updates';
import { sendManualMessage } from '@zenowethu/shared-lib/src/notifications/service';
import { getSearchableMailboxesWithPasswords } from '@/lib/mailbox-search';
import { z } from 'zod';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

const logger = createLogger('api/cases/[id]/check-updates');

const BodySchema = z.object({
    lookbackDays: z.coerce.number().int().min(1).max(1095).default(180),
});

const ACTIVITY_TYPE = 'CASE_EMAIL_UPDATE_PROCESSED';
/** Activity logged when a client-matched email's attachments are saved to the
 *  case but the email carried no textual status update (e.g. "please find
 *  attached"). Kept distinct from CASE_EMAIL_UPDATE_PROCESSED so it doesn't
 *  imply an AI-extracted update, while still feeding the already-seen skip set. */
const DOCS_ACTIVITY_TYPE = 'CASE_DOCUMENTS_HARVESTED';
/** Activity logged for every scan run (whether or not any updates were found). */
const SCAN_RUN_ACTIVITY_TYPE = 'CASE_UPDATE_SCAN_RUN';

function isInboxFolder(path: string): boolean {
    const p = path.toLowerCase();
    return p === 'inbox' || p.endsWith('/inbox') || p.endsWith('.inbox');
}

function isSentFolder(path: string): boolean {
    return /sent/i.test(path);
}

interface EmailVerdict {
    from: string;
    subject: string;
    isRelevant: boolean;
    hasUpdate: boolean;
    summary: string;
    docsSaved: number;
    outcome: 'update' | 'documents-only' | 'no-action';
}

interface MailboxScan {
    email: string;
    folders: string[];
    /** Raw messages the server SEARCH matched, before dedup/skip/limit. */
    rawMatches: number;
    /** Client-matched emails returned by the IMAP search for this mailbox. */
    candidates: number;
    verdicts: EmailVerdict[];
    error?: string;
}

interface SavedDoc {
    fileName: string;
    fileUrl: string;
    type: string;
}

/**
 * Persist a client-matched email's attachments to the case document vault,
 * skipping any that already exist (same file name + size). Shared by the
 * "update" and "documents-only" paths so harvesting isn't tied to whether the
 * AI detected a textual update in the body.
 */
async function saveEmailAttachments(
    attachments: { fileName: string; mimeType: string; buffer: Buffer; detectedType: string }[],
    caseId: string,
    uploadDir: string,
    uploadedById: string
): Promise<SavedDoc[]> {
    const savedDocs: SavedDoc[] = [];
    if (!attachments || attachments.length === 0) return savedDocs;

    try {
        await mkdir(uploadDir, { recursive: true });
    } catch {
        // ignore — writeFile will surface a real failure below
    }

    for (const att of attachments) {
        const existingDoc = await prisma.document.findFirst({
            where: { caseId, fileSize: att.buffer.length, fileName: att.fileName },
        });
        if (existingDoc) {
            continue; // Skip duplicate attachments already on the case
        }

        const safeName = att.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${Date.now()}-${safeName}`;

        try {
            await writeFile(join(uploadDir, uniqueFileName), att.buffer);
            const fileUrl = `/uploads/${caseId}/${uniqueFileName}`;

            await prisma.document.create({
                data: {
                    caseId,
                    type: att.detectedType || 'OTHER',
                    fileName: att.fileName,
                    fileUrl,
                    fileSize: att.buffer.length,
                    mimeType: att.mimeType,
                    uploadedById,
                },
            });

            savedDocs.push({ fileName: att.fileName, fileUrl, type: att.detectedType || 'OTHER' });
        } catch (wErr) {
            logger.warn(`Could not save email attachment ${uniqueFileName}:`, wErr);
        }
    }

    return savedDocs;
}

/** Human-readable list of the folder categories scanned across all mailboxes. */
function describeFolders(scannedInbox: boolean, scannedSent: boolean, folders: string[]): string {
    const parts = [
        `Inbox ${scannedInbox ? '✓' : '—'}`,
        `Sent Items ${scannedSent ? '✓' : '—'}`,
    ];
    const list = folders.length > 0 ? ` (${folders.join(', ')})` : '';
    return `${parts.join(', ')}${list}`;
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
        const body = await request.json().catch(() => ({}));
        const parsed = BodySchema.safeParse(body ?? {});
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { lookbackDays } = parsed.data;

        const caseData = await prisma.case.findUnique({
            where: { id: caseId },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });

        if (!caseData) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const idNumber = caseData.client.idNumber?.trim();
        const firstName = caseData.client.firstName?.trim();
        const lastName = caseData.client.lastName?.trim();

        if (!idNumber && (!firstName || !lastName)) {
            return NextResponse.json(
                { error: 'Cannot check updates until client ID number or name is saved on the case.' },
                { status: 422 }
            );
        }

        // Get already processed message IDs to avoid double scanning
        const processedComments = await prisma.caseComment.findMany({
            where: {
                caseId,
                activityType: { in: [ACTIVITY_TYPE, DOCS_ACTIVITY_TYPE] },
            },
            select: {
                activityData: true,
            },
        });

        const skipMessageIds = processedComments
            .map((c) => {
                try {
                    const data = JSON.parse(c.activityData ?? '{}');
                    return data.messageId;
                } catch {
                    return null;
                }
            })
            .filter((id): id is string => Boolean(id));

        // Get mailbox accounts with decrypted passwords
        const mailboxes = await getSearchableMailboxesWithPasswords(session.user.id);
        const readableMailboxes = mailboxes.filter((m) => m.password);

        if (readableMailboxes.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No mailboxes with saved passwords found. Please configure mailbox passwords in Admin settings.',
                updates: [],
                mailboxesScanned: 0,
            });
        }

        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const processedUpdates: any[] = [];
        const mailboxScans: MailboxScan[] = [];
        const uploadDir = join(process.cwd(), 'storage', 'uploads', caseId);

        for (const mailbox of readableMailboxes) {
            const scanEntry: MailboxScan = { email: mailbox.emailAddress, folders: [], rawMatches: 0, candidates: 0, verdicts: [] };
            mailboxScans.push(scanEntry);
            try {
                const emails = await scanMailboxForCaseUpdates({
                    config: {
                        host: mailbox.imapHost,
                        port: mailbox.imapPort,
                        secure: mailbox.imapSecure,
                        username: mailbox.emailAddress,
                        password: mailbox.password as string,
                    },
                    idNumber,
                    firstName,
                    lastName,
                    since,
                    limit: 10,
                    skipMessageIds,
                    onFoldersResolved: (folders) => {
                        scanEntry.folders = folders;
                    },
                    onRawMatches: (count) => {
                        scanEntry.rawMatches = count;
                    },
                });

                scanEntry.candidates = emails.length;

                for (const email of emails) {
                    if (email.messageId && skipMessageIds.includes(email.messageId)) {
                        continue;
                    }

                    // The email already matched this client by ID number / full
                    // name, so its attachments belong on the case regardless of
                    // whether the AI finds a textual update in the body. Harvest
                    // documents first, then use AI only for the update summary +
                    // consumer notification.
                    const savedDocs = await saveEmailAttachments(
                        email.attachments,
                        caseId,
                        uploadDir,
                        session.user.id
                    );

                    // Analyze email using AI (for the update summary / notification)
                    const analysis = await analyzeEmailForCaseUpdate({
                        from: email.from,
                        to: email.to,
                        subject: email.subject,
                        date: email.date,
                        body: email.body,
                    });

                    const hasUpdate = analysis.isRelevant && analysis.hasUpdate;
                    const verdict: EmailVerdict = {
                        from: email.from,
                        subject: email.subject,
                        isRelevant: analysis.isRelevant,
                        hasUpdate: analysis.hasUpdate,
                        summary: analysis.updateSummary,
                        docsSaved: savedDocs.length,
                        outcome: hasUpdate ? 'update' : savedDocs.length > 0 ? 'documents-only' : 'no-action',
                    };
                    scanEntry.verdicts.push(verdict);

                    // Nothing actionable: no textual update and no new documents.
                    if (!hasUpdate && savedDocs.length === 0) {
                        continue;
                    }

                    // Send consumer notification only when the AI produced one
                    // for a genuine update (never for silent document deliveries).
                    let notificationSent = false;
                    const notificationErrors: string[] = [];

                    if (hasUpdate && analysis.consumerNotificationMsg) {
                        const messageText = analysis.consumerNotificationMsg;

                        if (caseData.client.email) {
                            const emailRes = await sendManualMessage(
                                caseId,
                                'EMAIL',
                                caseData.client.email,
                                messageText,
                                `Case Update - File #${caseData.fileNumber}`,
                                { senderId: session.user.id }
                            );
                            if (emailRes.emailSuccess) {
                                notificationSent = true;
                            } else if (emailRes.errors?.length) {
                                notificationErrors.push(...emailRes.errors);
                            }
                        }

                        if (caseData.client.phone) {
                            const smsRes = await sendManualMessage(
                                caseId,
                                'SMS',
                                caseData.client.phone,
                                messageText,
                                undefined,
                                { senderId: session.user.id }
                            );
                            if (smsRes.smsSuccess) {
                                notificationSent = true;
                            } else if (smsRes.errors?.length) {
                                notificationErrors.push(...smsRes.errors);
                            }
                        }
                    }

                    const displaySummary = hasUpdate
                        ? analysis.updateSummary
                        : '📎 Documents received and saved to the case (no textual status update in the email).';

                    // Log CaseComment — as an AI-extracted update, or as a plain
                    // document-harvest note when the body carried no update.
                    const content = [
                        hasUpdate
                            ? `📧 Email Update extracted from message by AI.`
                            : `📎 Documents harvested from client-matched email.`,
                        `From: ${email.from}`,
                        `Subject: ${email.subject}`,
                        `Date: ${email.date ? new Date(email.date).toLocaleString('en-ZA') : 'Unknown'}`,
                        hasUpdate ? `\nUpdate Detail:\n${analysis.updateSummary}` : null,
                        savedDocs.length > 0
                            ? `\nAttached Files Uploaded:\n${savedDocs.map((d) => `• ${d.fileName} (${d.type})`).join('\n')}`
                            : null,
                        hasUpdate && analysis.consumerNotificationMsg
                            ? `\nClient Notified:\n"${analysis.consumerNotificationMsg}" (${notificationSent ? 'Sent ✓' : 'Failed ✗'})`
                            : null,
                    ]
                        .filter((line): line is string => Boolean(line))
                        .join('\n');

                    const activityType = hasUpdate ? ACTIVITY_TYPE : DOCS_ACTIVITY_TYPE;
                    const activityData = {
                        messageId: email.messageId,
                        from: email.from,
                        subject: email.subject,
                        date: email.date,
                        updateSummary: displaySummary,
                        consumerNotificationMsg: hasUpdate ? analysis.consumerNotificationMsg : null,
                        notificationSent,
                        notificationErrors,
                        uploadedDocuments: savedDocs,
                    };

                    await Promise.all([
                        prisma.caseComment.create({
                            data: {
                                caseId,
                                userId: session.user.id,
                                content,
                                type: 'NOTE',
                                isInternal: true,
                                activityType,
                                activityData: JSON.stringify(activityData),
                            },
                        }),
                        prisma.workflowLog.create({
                            data: {
                                caseId,
                                fromStatus: caseData.status,
                                toStatus: caseData.status,
                                action: activityType,
                                userId: session.user.id,
                                notes: content,
                            },
                        }),
                    ]);

                    processedUpdates.push({
                        subject: email.subject,
                        from: email.from,
                        date: email.date,
                        summary: displaySummary,
                        attachments: savedDocs,
                        notificationSent,
                        notificationMsg: hasUpdate ? analysis.consumerNotificationMsg : null,
                        documentsOnly: !hasUpdate,
                    });
                }
            } catch (err: any) {
                scanEntry.error = err?.message ? String(err.message) : String(err);
                logger.error(`Error scanning/processing updates for mailbox ${mailbox.emailAddress}:`, err);
            }
        }

        // Always record a scan-run entry in the case timeline — who ran it, when,
        // which mailboxes/folders were scanned — even when nothing new was found.
        const allFolders = [...new Set(mailboxScans.flatMap((m) => m.folders))];
        const scannedInbox = allFolders.some(isInboxFolder);
        const scannedSent = allFolders.some(isSentFolder);
        const scanErrors = mailboxScans
            .filter((m) => m.error)
            .map((m) => `${m.email}: ${m.error}`);
        const ranByName =
            session.user.name ||
            [firstName, lastName].filter(Boolean).join(' ') ||
            'A staff member';

        const rangeLabel =
            lookbackDays % 365 === 0
                ? `last ${lookbackDays / 365} year(s)`
                : `last ${lookbackDays} days`;

        // Diagnostics: how many client-matched emails were found and what
        // happened to each, so a "nothing harvested" result is explainable.
        const allVerdicts = mailboxScans.flatMap((m) => m.verdicts);
        const totalRawMatches = mailboxScans.reduce((n, m) => n + m.rawMatches, 0);
        const totalCandidates = mailboxScans.reduce((n, m) => n + m.candidates, 0);
        const documentsHarvested = processedUpdates.filter((u) => u.documentsOnly).length;
        const realUpdates = processedUpdates.length - documentsHarvested;
        const docsSavedCount = allVerdicts.reduce((n, v) => n + v.docsSaved, 0);
        const aiFailures = allVerdicts.filter((v) =>
            v.summary?.startsWith('Failed to analyze')
        ).length;

        const candidateLines = allVerdicts.slice(0, 10).map((v) => {
            const label =
                v.outcome === 'update'
                    ? 'update logged'
                    : v.outcome === 'documents-only'
                        ? `${v.docsSaved} doc(s) saved, no textual update`
                        : v.isRelevant
                            ? 'relevant, no update, no new docs'
                            : 'AI marked not relevant';
            return `• ${v.subject || '(no subject)'} — ${label}`;
        });

        const scanContent = [
            `🔄 Case update check run by ${session.user.name || 'staff'}.`,
            `Range: ${rangeLabel} (since ${since.toLocaleDateString('en-ZA')}).`,
            `Mailboxes scanned (${mailboxScans.length}): ${mailboxScans.map((m) => m.email).join(', ') || 'none'}.`,
            `Folders scanned: ${describeFolders(scannedInbox, scannedSent, allFolders)}.`,
            `Server search matched: ${totalRawMatches} message(s) by ID number / name (Subject + body). Client-matched emails to process: ${totalCandidates}.`,
            totalRawMatches > 0 && totalCandidates === 0
                ? `ℹ️ All server matches were already processed on a previous run.`
                : null,
            `Result: ${realUpdates} new update(s), ${documentsHarvested} email(s) with documents harvested (${docsSavedCount} file(s) saved).`,
            aiFailures > 0 ? `⚠️ AI analysis failed on ${aiFailures} email(s) — documents were still harvested; check AI provider config.` : null,
            candidateLines.length > 0 ? `Emails analysed:\n${candidateLines.join('\n')}` : null,
            scanErrors.length > 0 ? `Errors:\n${scanErrors.map((e) => `• ${e}`).join('\n')}` : null,
        ]
            .filter((line): line is string => Boolean(line))
            .join('\n');

        const scanActivityData = {
            scanType: 'CHECK_FOR_UPDATES',
            ranByUserId: session.user.id,
            ranByName,
            lookbackDays,
            since: since.toISOString(),
            mailboxes: mailboxScans.map((m) => ({
                email: m.email,
                folders: m.folders,
                rawMatches: m.rawMatches,
                candidates: m.candidates,
                verdicts: m.verdicts,
                error: m.error ?? null,
            })),
            scannedInbox,
            scannedSent,
            rawMatches: totalRawMatches,
            candidatesFound: totalCandidates,
            updatesFound: realUpdates,
            documentsHarvested,
            docsSavedCount,
            aiFailures,
            updates: processedUpdates,
            errors: scanErrors,
        };

        const scanRunComment = await prisma.caseComment.create({
            data: {
                caseId,
                userId: session.user.id,
                content: scanContent,
                type: 'NOTE',
                isInternal: true,
                activityType: SCAN_RUN_ACTIVITY_TYPE,
                activityData: JSON.stringify(scanActivityData),
            },
        });
        await prisma.workflowLog.create({
            data: {
                caseId,
                fromStatus: caseData.status,
                toStatus: caseData.status,
                action: SCAN_RUN_ACTIVITY_TYPE,
                userId: session.user.id,
                notes: scanContent,
            },
        });

        return NextResponse.json({
            success: true,
            message: `Check completed. Scanned ${readableMailboxes.length} mailbox(es), found ${totalCandidates} client-matched email(s). ${realUpdates} update(s), ${documentsHarvested} document delivery(ies) harvested.`,
            updates: processedUpdates,
            mailboxesScanned: readableMailboxes.length,
            scanRun: {
                ranByName,
                ranAt: scanRunComment.createdAt,
                lookbackDays,
                mailboxes: mailboxScans.map((m) => m.email),
                scannedInbox,
                scannedSent,
                rawMatches: totalRawMatches,
                candidatesFound: totalCandidates,
                updatesFound: realUpdates,
                documentsHarvested,
                docsSavedCount,
                aiFailures,
                errors: scanErrors,
            },
        });
    } catch (error) {
        logger.error('Error in check-updates handler:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Returns metadata about the most recent "Check for Updates" scan for this case
 * (who ran it, when, which mailboxes/folders were scanned, and the updates it
 * found). Used to show a pre-run confirmation so staff can avoid re-scanning
 * unnecessarily and can re-open the most recent results.
 */
export async function GET(
    _request: Request,
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

        const last = await prisma.caseComment.findFirst({
            where: { caseId, activityType: SCAN_RUN_ACTIVITY_TYPE },
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { firstName: true, lastName: true } },
            },
        });

        if (!last) {
            return NextResponse.json({ lastScan: null });
        }

        let data: Record<string, any> = {};
        try {
            data = JSON.parse(last.activityData ?? '{}');
        } catch {
            data = {};
        }

        const ranByName =
            data.ranByName ||
            [last.user?.firstName, last.user?.lastName].filter(Boolean).join(' ') ||
            'A staff member';

        return NextResponse.json({
            lastScan: {
                ranByName,
                ranAt: last.createdAt,
                lookbackDays: data.lookbackDays ?? null,
                mailboxes: Array.isArray(data.mailboxes)
                    ? data.mailboxes.map((m: any) => m.email).filter(Boolean)
                    : [],
                scannedInbox: Boolean(data.scannedInbox),
                scannedSent: Boolean(data.scannedSent),
                rawMatches: data.rawMatches ?? 0,
                candidatesFound: data.candidatesFound ?? 0,
                updatesFound: data.updatesFound ?? 0,
                documentsHarvested: data.documentsHarvested ?? 0,
                aiFailures: data.aiFailures ?? 0,
                updates: Array.isArray(data.updates) ? data.updates : [],
                errors: Array.isArray(data.errors) ? data.errors : [],
            },
        });
    } catch (error) {
        logger.error('Error in check-updates GET handler:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
