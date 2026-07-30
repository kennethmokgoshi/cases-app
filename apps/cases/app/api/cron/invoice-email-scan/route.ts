/**
 * Scheduled Invoice Email Scanner — /api/cron/invoice-email-scan
 *
 * Scans connected mailboxes for cases in status INVOICE_REQUESTED_DC / IRFDC_*
 * to automatically harvest Debt Counsellor fee invoices and proof of payment replies.
 *
 * Auth: x-cron-secret header (cron) OR an authenticated admin session (manual run).
 *
 * Query params:
 *   ?dryRun=true   — preview matching cases & mailboxes without performing IMAP scans
 *   ?limit=N       — max cases to process in one run (default: 20)
 *   ?lookbackDays=N — lookback window for IMAP search (default: 90)
 *
 * Recommended schedule: 0 9,14 * * 1-5  (weekdays 9am and 2pm)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger, getSMTPCredentials } from '@zenowethu/shared-lib';
import { logAutomationRun } from '@zenowethu/shared-lib/src/automation/run-logger';
import { scanMailboxForClient } from '@zenowethu/shared-lib/src/integrations/imap';
import { decryptSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { isUsableMailboxPassword, usesSmtpPassword } from '@/lib/mailboxes';
import { getSmtpUsernameIfConfigured } from '@/lib/mailbox-smtp';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import crypto from 'crypto';

const logger = createLogger('cron/invoice-email-scan');

const INVOICE_REQUESTED_STATUSES = [
    'INVOICE_REQUESTED_DC',
    'IRFDC_1M',
    'IRFDC_2M',
    'IRFDC_3M',
    'IRFDC_4M_PLUS',
];

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

async function getSystemMailboxes(): Promise<SearchableMailbox[]> {
    const [rows, smtpUsername] = await Promise.all([
        prisma.mailboxAccount.findMany({
            where: { isActive: true },
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

export async function POST(request: Request) {
    const cronSecret = request.headers.get('x-cron-secret');
    const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;

    if (!isValidCron) {
        const session = await auth();
        if (!session?.user?.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 0) : 20;
    const lookbackParam = url.searchParams.get('lookbackDays');
    const lookbackDays = lookbackParam ? Math.max(1, parseInt(lookbackParam, 10) || 0) : 90;

    const startedAt = new Date();
    logger.info(`[CRON] Invoice email scan starting (dryRun=${dryRun}, limit=${limit}, lookbackDays=${lookbackDays})...`);

    try {
        const cases = await prisma.case.findMany({
            where: {
                status: { in: INVOICE_REQUESTED_STATUSES },
            },
            take: limit,
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                fileNumber: true,
                status: true,
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                        idNumber: true,
                    },
                },
            },
        });

        const validCases = cases.filter(c => c.client.idNumber?.trim());

        if (dryRun) {
            const mailboxes = await getSystemMailboxes();
            return NextResponse.json({
                success: true,
                dryRun: true,
                casesFound: cases.length,
                validCasesToScan: validCases.length,
                mailboxesAvailable: mailboxes.map(m => ({ email: m.emailAddress, hasPassword: m.hasPassword })),
                cases: validCases.map(c => ({ id: c.id, fileNumber: c.fileNumber, status: c.status, client: `${c.client.firstName} ${c.client.lastName}` })),
            });
        }

        const mailboxes = await getSystemMailboxes();
        const readableMailboxes = mailboxes.filter(m => m.hasPassword);

        if (readableMailboxes.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No readable mailboxes with saved passwords available for scan.',
                casesScanned: 0,
                documentsHarvested: 0,
            });
        }

        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        let totalDocsSaved = 0;
        let totalEmailsScanned = 0;
        const caseResults: Array<{ caseId: string; fileNumber: string; docsSaved: number }> = [];

        const systemUser = await prisma.user.findFirst({
            where: { role: 'ADMIN' },
            select: { id: true },
        });
        const systemUserId = systemUser?.id || 'system-cron';

        for (const caseData of validCases) {
            const caseId = caseData.id;
            const idNumber = caseData.client.idNumber!.trim();
            const uploadDir = join(process.cwd(), 'storage', 'uploads', caseId);
            let caseDocsSaved = 0;

            for (const mailbox of readableMailboxes) {
                let password: string | null = null;
                if (mailbox.password) {
                    try {
                        password = decryptSecret(mailbox.password);
                    } catch {
                        password = mailbox.password;
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
                if (!password) continue;

                try {
                    const processedMessages = await prisma.processedMailboxMessage.findMany({
                        where: { mailboxAccountId: mailbox.id },
                        select: { messageId: true },
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
                        since,
                        skipMessageIds,
                        docGroup: 'DC_INVOICE',
                    });

                    totalEmailsScanned += scanResult.emailsScanned;

                    if (scanResult.attachments.length > 0) {
                        try { await mkdir(uploadDir, { recursive: true }); } catch { /* ignore */ }

                        for (const att of scanResult.attachments) {
                            const hash = crypto.createHash('sha256').update(att.buffer).digest('hex');

                            const [existingDoc, existingMessage] = await Promise.all([
                                prisma.document.findFirst({
                                    where: { caseId, fileSize: att.buffer.length, fileName: att.fileName },
                                }),
                                att.messageId ? prisma.processedMailboxMessage.findFirst({
                                    where: { mailboxAccountId: mailbox.id, messageId: att.messageId, attachmentHash: hash },
                                }) : null,
                            ]);

                            if (existingDoc || existingMessage) continue;

                            const safeName = att.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                            const uniqueFileName = `${Date.now()}-${safeName}`;
                            await writeFile(join(uploadDir, uniqueFileName), att.buffer);

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
                                    uploadedById: systemUserId,
                                },
                            });

                            if (att.messageId) {
                                await prisma.processedMailboxMessage.upsert({
                                    where: {
                                        mailboxAccountId_messageId: {
                                            mailboxAccountId: mailbox.id,
                                            messageId: att.messageId,
                                        },
                                    },
                                    update: { attachmentHash: hash },
                                    create: {
                                        mailboxAccountId: mailbox.id,
                                        messageId: att.messageId,
                                        attachmentHash: hash,
                                    },
                                });
                            }

                            caseDocsSaved++;
                            totalDocsSaved++;
                        }
                    }
                } catch (mbErr) {
                    logger.warn(`Cron IMAP error for case ${caseData.fileNumber} on ${mailbox.emailAddress}:`, mbErr);
                }
            }

            if (caseDocsSaved > 0) {
                const note = `🤖 Automated Cron Scan harvested ${caseDocsSaved} invoice/PoP document(s) from mailboxes.`;
                await Promise.all([
                    prisma.caseComment.create({
                        data: {
                            caseId,
                            userId: systemUserId,
                            content: note,
                            type: 'NOTE',
                            isInternal: true,
                            activityType: 'CRON_INVOICE_SCAN_HARVESTED',
                        },
                    }),
                    prisma.workflowLog.create({
                        data: {
                            caseId,
                            fromStatus: caseData.status,
                            toStatus: caseData.status,
                            action: 'CRON_INVOICE_SCAN_HARVESTED',
                            userId: systemUserId,
                            notes: note,
                        },
                    }),
                ]);
            }

            caseResults.push({ caseId: caseData.id, fileNumber: caseData.fileNumber, docsSaved: caseDocsSaved });
        }

        await logAutomationRun({
            type: 'INVOICE_EMAIL_SCAN',
            status: 'SUCCESS',
            startedAt,
            logs: {
                casesEligible: cases.length,
                casesScanned: validCases.length,
                mailboxesScanned: readableMailboxes.length,
                totalEmailsScanned,
                totalDocsSaved,
                caseResults,
            },
        });

        logger.info(`[CRON] Invoice email scan finished. Scanned ${validCases.length} cases, saved ${totalDocsSaved} documents.`);
        return NextResponse.json({
            success: true,
            casesScanned: validCases.length,
            documentsHarvested: totalDocsSaved,
            ranAt: new Date().toISOString(),
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[CRON] Invoice email scan failed:', error);
        await logAutomationRun({ type: 'INVOICE_EMAIL_SCAN', status: 'FAILED', startedAt, errorMessage: msg });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export const maxDuration = 300;
