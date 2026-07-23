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
import crypto from 'crypto';

const logger = createLogger('api/cases/[id]/check-updates');

const BodySchema = z.object({
    lookbackDays: z.coerce.number().int().min(1).max(1095).default(180),
});

const ACTIVITY_TYPE = 'CASE_EMAIL_UPDATE_PROCESSED';

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
                activityType: ACTIVITY_TYPE,
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
        const uploadDir = join(process.cwd(), 'storage', 'uploads', caseId);

        for (const mailbox of readableMailboxes) {
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
                });

                for (const email of emails) {
                    if (email.messageId && skipMessageIds.includes(email.messageId)) {
                        continue;
                    }
                    // Analyze email using AI
                    const analysis = await analyzeEmailForCaseUpdate({
                        from: email.from,
                        to: email.to,
                        subject: email.subject,
                        date: email.date,
                        body: email.body,
                    });

                    if (analysis.isRelevant && analysis.hasUpdate) {
                        const savedDocs: { fileName: string; fileUrl: string; type: string }[] = [];

                        // If email has attachments, upload them
                        if (email.attachments && email.attachments.length > 0) {
                            try {
                                await mkdir(uploadDir, { recursive: true });
                            } catch {
                                // ignore
                            }

                            for (const att of email.attachments) {
                                const hash = crypto.createHash('sha256').update(att.buffer).digest('hex');

                                const existingDoc = await prisma.document.findFirst({
                                    where: {
                                        caseId,
                                        fileSize: att.buffer.length,
                                        fileName: att.fileName,
                                    },
                                });

                                if (existingDoc) {
                                    continue; // Skip duplicate attachments
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
                                            uploadedById: session.user.id,
                                        },
                                    });

                                    savedDocs.push({
                                        fileName: att.fileName,
                                        fileUrl,
                                        type: att.detectedType || 'OTHER',
                                    });
                                } catch (wErr) {
                                    logger.warn(`Could not save update attachment ${uniqueFileName}:`, wErr);
                                }
                            }
                        }

                        // Send consumer notification if generated by AI
                        let notificationSent = false;
                        const notificationErrors: string[] = [];

                        if (analysis.consumerNotificationMsg) {
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

                        // Log CaseComment
                        const content = [
                            `📧 Email Update extracted from message by AI.`,
                            `From: ${email.from}`,
                            `Subject: ${email.subject}`,
                            `Date: ${email.date ? new Date(email.date).toLocaleString('en-ZA') : 'Unknown'}`,
                            `\nUpdate Detail:\n${analysis.updateSummary}`,
                            savedDocs.length > 0
                                ? `\nAttached Files Uploaded:\n${savedDocs.map((d) => `• ${d.fileName} (${d.type})`).join('\n')}`
                                : null,
                            analysis.consumerNotificationMsg
                                ? `\nClient Notified:\n"${analysis.consumerNotificationMsg}" (${notificationSent ? 'Sent ✓' : 'Failed ✗'})`
                                : null,
                        ]
                            .filter((line): line is string => Boolean(line))
                            .join('\n');

                        const activityData = {
                            messageId: email.messageId,
                            from: email.from,
                            subject: email.subject,
                            date: email.date,
                            updateSummary: analysis.updateSummary,
                            consumerNotificationMsg: analysis.consumerNotificationMsg,
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
                                    activityType: ACTIVITY_TYPE,
                                    activityData: JSON.stringify(activityData),
                                },
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

                        processedUpdates.push({
                            subject: email.subject,
                            from: email.from,
                            date: email.date,
                            summary: analysis.updateSummary,
                            attachments: savedDocs,
                            notificationSent,
                            notificationMsg: analysis.consumerNotificationMsg,
                        });
                    }
                }
            } catch (err: any) {
                logger.error(`Error scanning/processing updates for mailbox ${mailbox.emailAddress}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Check completed. Scanned ${readableMailboxes.length} mailbox(es). Found ${processedUpdates.length} update(s).`,
            updates: processedUpdates,
            mailboxesScanned: readableMailboxes.length,
        });
    } catch (error) {
        logger.error('Error in check-updates handler:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
