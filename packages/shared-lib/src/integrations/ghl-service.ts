import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@zenowethu/database';
import { getGHLCredentials } from './ghl-config';
import { logger } from '../logger';
import {
    GhlSmsProvider,
    GhlEmailProvider,
    GhlWhatsAppProvider,
} from '../notifications/providers';
import {
    sendManualMessage
} from '../notifications/service';
import { generateAutoReply } from '../ai/auto-reply';
import { extractSaIdNumber } from '../utils/extract-id-number';
import { logAutomationRun } from '../automation/run-logger';

export interface GhlSendResult {
    success: boolean;
    messageId?: string;
    contactId?: string;
    error?: string;
    channel: string;
    recipient: string;
    provider?: string;
}

export class GhlService {
    static async handleWebhook(payload: Record<string, unknown>) {
        logger.info('[GHL Webhook] Received payload:', JSON.stringify(payload, null, 2));

        const type = payload.type;

        if (type === 'InboundMessage' || payload.message) {
            return this.handleInboundMessage(payload);
        }

        if (type === 'ContactCreate') {
            return this.handleContactCreate(payload);
        }

        if (type === 'OpportunityUpdate' || type === 'OpportunityCreate') {
            return this.handleOpportunityUpdate(payload);
        }

        return { success: true };
    }

    private static async handleInboundMessage(payload: Record<string, unknown>) {
        const contact = payload.contact as Record<string, unknown> | undefined;
        const message = ((payload.message ?? payload.body) as string | undefined) || '';
        const contactId = payload.contactId as string | undefined;
        const phone = (payload.phone ?? contact?.phone) as string | undefined;
        const email = (payload.email ?? contact?.email) as string | undefined;
        const channel = (payload.channelType ?? 'SMS') as string;
        const attachments = (payload.attachments as any[]) || [];

        if (!message && attachments.length === 0) {
            logger.warn('[GHL Webhook] Missing message and attachments');
            return { success: false, error: 'Incomplete payload' };
        }

        if (!phone && !email) {
            logger.warn('[GHL Webhook] Missing contact info');
            return { success: false, error: 'No phone or email' };
        }

        const caseRecord = await prisma.case.findFirst({
            where: {
                OR: [
                    { client: { phone: phone } },
                    { client: { email: email } },
                    { client: { phone: { endsWith: phone?.slice(-9) } } },
                    { dcEmail: email },
                ],
            },
            include: { client: true },
        });

        if (!caseRecord) {
            // Fallback: extract SA ID number from message body or email subject
            const subject = (payload.subject as string | undefined) || '';
            const searchText = `${message} ${subject}`;
            const extractedId = extractSaIdNumber(searchText);

            if (extractedId) {
                const clientByIdNumber = await prisma.client.findFirst({
                    where: { idNumber: extractedId },
                    include: {
                        cases: {
                            where: { isDeleted: false },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                });

                if (clientByIdNumber && clientByIdNumber.cases.length > 0) {
                    const matchedCase = clientByIdNumber.cases[0];
                    const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

                    await prisma.caseComment.create({
                        data: {
                            caseId: matchedCase.id,
                            userId: systemUser?.id ?? 'system',
                            content: `[Inbound ${channel}] [MATCHED BY ID NUMBER: ${extractedId}] ${message}${attachments.length > 0 ? ` (+ ${attachments.length} attachments)` : ''}`,
                            type: 'GHL',
                            isInternal: false,
                            activityType: 'INBOUND_MESSAGE',
                            activityData: JSON.stringify({
                                channel,
                                contactId,
                                provider: 'GoHighLevel',
                                matchedByIdNumber: extractedId,
                                attachments: attachments.map((a: any) => ({ url: a.url, name: a.name, type: a.contentType })),
                                intent: 'GENERAL',
                            }),
                        },
                    });

                    // Notify the case manager so they can review
                    const managers = await prisma.projectMember.findMany({
                        where: {
                            project: { cases: { some: { id: matchedCase.id } } },
                            role: 'MANAGER',
                        },
                        select: { userId: true },
                    });
                    for (const m of managers) {
                        await prisma.inAppNotification.create({
                            data: {
                                userId: m.userId,
                                type: 'SYSTEM_ALERT',
                                title: `Inbound Message Matched by ID Number`,
                                message: `An inbound ${channel} message was matched to case ${matchedCase.fileNumber} using ID number ${extractedId}. Please review.`,
                                caseId: matchedCase.id,
                                linkUrl: `/cases/${matchedCase.id}`,
                            },
                        });
                    }

                    await logAutomationRun({
                        type: 'GHL_ID_MATCH',
                        caseId: matchedCase.id,
                        clientId: clientByIdNumber.id,
                        status: 'SUCCESS',
                        startedAt: new Date(),
                        logs: { extractedId, channel, matchedBy: 'ID_NUMBER' },
                    });

                    logger.info(`[GHL Webhook] Matched inbound message to case ${matchedCase.fileNumber} via ID number ${extractedId}`);
                    return { success: true, caseId: matchedCase.id, matchedByIdNumber: true };
                }
            }

            logger.warn('[GHL Webhook] No case found for contact:', { phone, email, extractedId });
            return { success: false, error: 'Case not found' };
        }

        // Persist contactId on the Client if we now know it and didn't before
        const isClient = 
            (email && email === caseRecord.client.email) ||
            (phone && (phone === caseRecord.client.phone || (caseRecord.client.phone && phone.endsWith(caseRecord.client.phone.slice(-9)))));
        if (contactId && !caseRecord.client.ghlContactId && isClient) {
            await prisma.client.update({
                where: { id: caseRecord.client.id },
                data: { ghlContactId: contactId },
            });
        }

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

        // Check for specific intents
        const messageLower = message.toLowerCase();
        const isFeesOwed = messageLower.includes('fees owed') || messageLower.includes('outstanding fees') || messageLower.includes('pay fees');
        const isPoP = messageLower.includes('proof of payment') || messageLower.includes('pop') || messageLower.includes('paid');

        await prisma.caseComment.create({
            data: {
                caseId: caseRecord.id,
                userId: systemUser?.id ?? 'system',
                content: `[Inbound ${channel}] ${message}${attachments.length > 0 ? ` (+ ${attachments.length} attachments)` : ''}`,
                type: 'GHL',
                isInternal: false,
                activityType: isFeesOwed ? 'REJECTION_FEES_OWED' : isPoP ? 'PROOF_OF_PAYMENT_RECEIVED' : 'INBOUND_MESSAGE',
                activityData: JSON.stringify({
                    channel,
                    contactId,
                    provider: 'GoHighLevel',
                    attachments: attachments.map(a => ({ url: a.url, name: a.name, type: a.contentType })),
                    intent: isFeesOwed ? 'FEES_OWED' : isPoP ? 'POP' : 'GENERAL'
                }),
            },
        });

        // Trigger Automated Invoicing if fees are owed
        if (isFeesOwed) {
            logger.info(`[GHL Webhook] Triggering automated invoice for case ${caseRecord.fileNumber}`);
            this.triggerInvoiceGeneration(caseRecord.id).catch(err => {
                logger.error('[GHL Webhook] Invoice generation failed:', err);
            });
        }

        // Download inbound attachments, persist as Document records, and forward PoP to DC
        if (attachments.length > 0) {
            this.processInboundAttachments(
                caseRecord.id,
                attachments,
                isPoP,
                caseRecord.dcEmail ?? undefined,
            ).catch(err => logger.error('[GHL Webhook] Attachment processing failed:', err));
        }

        // Notify AI Plan Engine of inbound event
        try {
            const pkgName = ['@zenowethu', 'plan-engine'].join('/');
            // @ts-ignore — plan-engine resolved at runtime via pnpm workspace
            const { handlePlanEvent } = await import(pkgName);
            await handlePlanEvent({
                caseId: caseRecord.id,
                planId: '',
                eventSource: 'GHL',
                eventType: isPoP ? 'PAYMENT_RECEIVED' : channel.toUpperCase().includes('EMAIL') ? 'DOCUMENT_RECEIVED' : 'REPLY_RECEIVED',
                eventData: { channel, contactId, message, attachments, provider: 'GoHighLevel' },
                description: `Inbound ${channel} from ${email === caseRecord.dcEmail ? 'Debt Counsellor' : 'Client'}: "${message.substring(0, 200)}"`,
            });
        } catch (err) {
            logger.warn('[GHL Webhook] Plan event notification failed (non-critical):', err);
        }

        // AI auto-reply — only for GENERAL messages (not PoP or fees-owed, those are handled specifically)
        if (!isFeesOwed && !isPoP && message.trim()) {
            this.sendAutoReply(caseRecord, channel, message, email, phone, !!isClient).catch(err =>
                logger.warn('[GHL Webhook] Auto-reply failed (non-critical):', err)
            );
        }

        return { success: true, caseId: caseRecord.id };
    }

    private static async sendAutoReply(
        caseRecord: any,
        channelRaw: string,
        inboundMessage: string,
        senderEmail: string | undefined,
        senderPhone: string | undefined,
        senderIsClient: boolean,
    ): Promise<void> {
        const normalizedChannel: 'SMS' | 'EMAIL' | 'WHATSAPP' =
            channelRaw.toUpperCase().includes('EMAIL')     ? 'EMAIL' :
            channelRaw.toUpperCase().includes('WHATSAPP')  ? 'WHATSAPP' : 'SMS';

        const replyTo = normalizedChannel === 'EMAIL' ? senderEmail : senderPhone;
        if (!replyTo) {
            logger.warn('[AutoReply] No reply address — skipping');
            return;
        }

        // Pull last 3 non-system comments for AI context
        const recentComments = await prisma.caseComment.findMany({
            where: { caseId: caseRecord.id, isInternal: false, NOT: { content: { startsWith: '[SYSTEM]' } } },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { content: true },
        });
        const recentActivity = recentComments.map(c => c.content.substring(0, 120)).join(' | ');

        const reply = await generateAutoReply({
            inboundMessage,
            channel: normalizedChannel,
            senderType: senderIsClient ? 'CLIENT' : 'DEBT_COUNSELLOR',
            caseContext: {
                fileNumber: caseRecord.fileNumber,
                statusLabel: caseRecord.dhsStatus || caseRecord.status || 'In Progress',
                nextUpdate: caseRecord.nextUpdate?.toISOString() ?? null,
                clientFirstName: caseRecord.client.firstName,
                clientFullName: `${caseRecord.client.firstName} ${caseRecord.client.lastName}`,
                dcName: caseRecord.debtCounsellorName ?? null,
                recentActivity,
            },
        });

        if (!reply.shouldSend) {
            logger.info(`[AutoReply] AI skipped reply: ${reply.reasoning}`);
            return;
        }

        // Format SA number: 0821234567 → +27821234567
        const formattedTo = normalizedChannel !== 'EMAIL' && replyTo.startsWith('0')
            ? '+27' + replyTo.substring(1)
            : replyTo;

        const result = await sendManualMessage(
            caseRecord.id,
            normalizedChannel,
            formattedTo,
            reply.body,
            reply.subject || undefined,
        );

        const sent =
            normalizedChannel === 'EMAIL'    ? result.emailSuccess :
            normalizedChannel === 'WHATSAPP' ? result.whatsappSuccess :
            result.smsSuccess;

        // Log the auto-reply as a case comment
        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        await prisma.caseComment.create({
            data: {
                caseId: caseRecord.id,
                userId: systemUser?.id ?? 'system',
                content: `[Auto-Reply via ${normalizedChannel}] ${reply.body}`,
                type: 'GHL',
                isInternal: true,
                activityType: 'AUTO_REPLY',
                activityData: JSON.stringify({
                    channel: normalizedChannel,
                    replyTo: formattedTo,
                    subject: reply.subject,
                    reasoning: reply.reasoning,
                    sent,
                }),
            },
        });

        logger.info(`[AutoReply] sent=${sent} channel=${normalizedChannel} to=${formattedTo} reason="${reply.reasoning}"`);
    }

    private static async processInboundAttachments(
        caseId: string,
        attachments: Array<{ url: string; name?: string; contentType?: string }>,
        isPoP: boolean,
        dcEmail?: string,
    ): Promise<void> {
        const uploadDir = join(process.cwd(), 'storage', 'uploads', caseId);
        await mkdir(uploadDir, { recursive: true });

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        const savedUrls: string[] = [];

        for (const att of attachments) {
            try {
                const res = await fetch(att.url);
                if (!res.ok) {
                    logger.warn(`[GHL Service] Failed to download attachment (${res.status}): ${att.url}`);
                    continue;
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                const mimeType = res.headers.get('content-type') || att.contentType || 'application/octet-stream';
                const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
                const safeName = (att.name ?? `attachment.${ext}`).replace(/[^a-zA-Z0-9.-]/g, '_');
                const fileName = `${Date.now()}-${safeName}`;

                await writeFile(join(uploadDir, fileName), buffer);

                const fileUrl = `/uploads/${caseId}/${fileName}`;

                await prisma.document.create({
                    data: {
                        caseId,
                        type: isPoP ? 'PROOF_OF_PAYMENT' : 'OTHER',
                        fileName: att.name ?? fileName,
                        fileUrl,
                        fileSize: buffer.length,
                        mimeType,
                        uploadedById: systemUser?.id,
                    },
                });

                savedUrls.push(fileUrl);
                logger.info(`[GHL Service] Saved inbound attachment: ${fileUrl}`);
            } catch (err) {
                logger.error(`[GHL Service] Error processing attachment ${att.url}:`, err);
            }
        }

        // Forward PoP to the DC automatically
        if (isPoP && savedUrls.length > 0 && dcEmail) {
            const caseRecord = await prisma.case.findUnique({
                where: { id: caseId },
                include: { client: true },
            });
            if (caseRecord) {
                await this.sendMessage(
                    caseId,
                    'EMAIL',
                    `Please find the attached proof of payment from ${caseRecord.client.firstName} ${caseRecord.client.lastName} regarding case ${caseRecord.fileNumber}.`,
                    `Proof of Payment — ${caseRecord.fileNumber}`,
                    dcEmail,
                    savedUrls,
                );
                logger.info(`[GHL Service] PoP forwarded to DC at ${dcEmail} for case ${caseId}`);
            }
        }
    }

    private static async handleContactCreate(payload: Record<string, unknown>) {
        const firstName = (payload.firstName as string) || 'Unknown';
        const lastName = (payload.lastName as string) || 'Unknown';
        const email = payload.email as string | undefined;
        const phone = payload.phone as string | undefined;
        const contactId = payload.id as string;

        if (!contactId || (!email && !phone)) {
            return { success: false, error: 'Missing contact info' };
        }

        // Check if client exists
        let client = await prisma.client.findFirst({
            where: {
                OR: [
                    { ghlContactId: contactId },
                    ...(email ? [{ email }] : []),
                    ...(phone ? [{ phone }] : []),
                ],
            },
        });

        if (client) {
            // Update client with ghlContactId if missing
            if (!client.ghlContactId) {
                await prisma.client.update({
                    where: { id: client.id },
                    data: { ghlContactId: contactId },
                });
            }
            return { success: true, clientId: client.id };
        }

        // Create new client
        client = await prisma.client.create({
            data: {
                firstName,
                lastName,
                email,
                phone,
                ghlContactId: contactId,
                idNumber: `GHL-${contactId.substring(0, 8)}`, // Placeholder ID if none provided
            },
        });

        logger.info(`[GHL Webhook] Created new client ${client.id} from GHL contact ${contactId}`);
        return { success: true, clientId: client.id };
    }

    private static async handleOpportunityUpdate(payload: Record<string, unknown>) {
        const contactId = payload.contactId as string;
        const status = payload.status as string; // 'open', 'won', 'lost', 'abandoned'
        const pipelineId = payload.pipelineId as string;
        const stageId = payload.pipelineStageId as string;

        // We trigger case creation on 'won' status or specific stages
        // In a real scenario, these IDs would be configurable
        const isWon = status === 'won';
        const isTargetStage = stageId === 'signed' || stageId === 'interested'; // Example stage IDs

        if (!isWon && !isTargetStage) {
            return { success: true, message: 'Opportunity not at target stage' };
        }

        const client = await prisma.client.findFirst({
            where: { ghlContactId: contactId },
        });

        if (!client) {
            return { success: false, error: 'Client not found for opportunity' };
        }

        // Check if case already exists
        const existingCase = await prisma.case.findFirst({
            where: { clientId: client.id },
        });

        if (existingCase) {
            return { success: true, caseId: existingCase.id, message: 'Case already exists' };
        }

        // Create new case
        const fileNumber = await this.generateFileNumber();
        const newCase = await prisma.case.create({
            data: {
                fileNumber,
                clientId: client.id,
                status: 'NEW_LEAD',
                acquisitionType: 'GHL',
                leadSource: (payload.source as string) || 'GHL_OPPORTUNITY',
                ghlOpportunityId: payload.id as string,
                marketingData: JSON.stringify(payload),
            },
        });

        logger.info(`[GHL Webhook] Created new case ${newCase.fileNumber} for client ${client.id}`);
        return { success: true, caseId: newCase.id };
    }

    private static async generateFileNumber(): Promise<string> {
        const year = new Date().getFullYear();
        const lastCase = await prisma.case.findFirst({
            where: { fileNumber: { startsWith: `ZDM-${year}-` } },
            orderBy: { fileNumber: 'desc' },
            select: { fileNumber: true },
        });
        let nextNumber = 1;
        if (lastCase) {
            const parts = lastCase.fileNumber.split('-');
            const lastNum = parseInt(parts[2] || '0', 10);
            nextNumber = (isNaN(lastNum) ? 0 : lastNum) + 1;
        }
        return `ZDM-${year}-${String(nextNumber).padStart(3, '0')}`;
    }

    /**
     * Send a message to a case's client via GHL (SMS, EMAIL, or WHATSAPP).
     * - Looks up or creates the GHL contact automatically.
     * - Persists the returned contactId on the Client record.
     * - Logs every attempt to NotificationLog.
     */
    static async sendMessage(
        caseId: string,
        channel: 'SMS' | 'EMAIL' | 'WHATSAPP',
        message: string,
        subject?: string,
        recipient?: string,
        attachments?: string[],
        cc?: string[],
    ): Promise<GhlSendResult> {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });
 
        if (!caseRecord) throw new Error(`Case not found: ${caseId}`);
 
        const { client } = caseRecord;
 
        const ghl = await getGHLCredentials();
        if (!ghl.apiKey || !ghl.locationId) {
            throw new Error('GHL not configured: missing apiKey or locationId');
        }
 
        // Determine the recipient address for this channel
        const to = recipient ?? (
            channel === 'EMAIL'
                ? client.email
                : (client.whatsappNumber ?? client.phone)
        );
 
        if (!to) {
            const missing = channel === 'EMAIL' ? 'email' : 'phone/whatsappNumber';
            throw new Error(`Recipient has no ${missing} — cannot send ${channel}`);
        }
 
        // Format SA numbers: 0821234567 → +27821234567
        const formattedTo =
            channel !== 'EMAIL' && to.startsWith('0')
                ? '+27' + to.substring(1)
                : to;
 
        let result: GhlSendResult;
 
        try {
            // Use the unified manual message sending logic from the notification service.
            // This ensures we respect WHATSAPP_ENABLED, GHL_WEBHOOK_URL, and other config flags.
            const notificationRes = await sendManualMessage(
                caseId,
                channel,
                formattedTo,
                message,
                subject,
                { attachments, cc }
            );

            result = {
                success: channel === 'SMS' ? notificationRes.smsSuccess : 
                         channel === 'EMAIL' ? notificationRes.emailSuccess : 
                         notificationRes.whatsappSuccess,
                messageId: channel === 'SMS' ? notificationRes.smsMessageId : 
                           channel === 'EMAIL' ? notificationRes.emailMessageId : 
                           notificationRes.whatsappMessageId,
                contactId: notificationRes.contactId,
                error: notificationRes.errors[0],
                channel,
                recipient: formattedTo,
                provider: 'GoHighLevel' // Simplified for result
            };

            // Persist the GHL contactId on the Client so future sends skip the lookup
            // Only do this if we were sending to the client directly
            if (!recipient && result.contactId && !client.ghlContactId) {
                await prisma.client.update({
                    where: { id: client.id },
                    data: { ghlContactId: result.contactId },
                });
                logger.info(`[GHL Service] Stored ghlContactId=${result.contactId} on Client ${client.id}`);
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            result = { success: false, error, channel, recipient: formattedTo };
            logger.error(`[GHL Service] sendMessage failed: caseId=${caseId} channel=${channel}`, err);
        }

        // Always log the attempt regardless of success/failure
        await prisma.notificationLog.create({
            data: {
                caseId,
                channel,
                recipient: result.recipient,
                recipientType: 'CLIENT',
                message,
                success: result.success,
                externalId: result.messageId,
                error: result.error,
                provider: 'GoHighLevel',
                senderId: caseRecord.assignedToId,
            },
        });

        logger.info(
            `[GHL Service] sendMessage: caseId=${caseId} channel=${channel} success=${result.success} messageId=${result.messageId ?? 'none'}`,
        );

        return result;
    }

    /**
     * Apply one or more tags to a GHL contact, creating the contact first if needed.
     * Used to trigger GHL automation workflows (e.g. "dhs_file_requested" → 5-day follow-up sequence).
     */
    static async applyTags(caseId: string, tags: string[]): Promise<{ success: boolean; error?: string }> {
        try {
            const caseRecord = await prisma.case.findUnique({
                where: { id: caseId },
                include: { client: true },
            });
            if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

            const ghl = await getGHLCredentials();
            if (!ghl.apiKey || !ghl.locationId) {
                logger.warn('[GHL Service] applyTags: GHL not configured — skipping');
                return { success: false, error: 'GHL not configured' };
            }

            const { client } = caseRecord;

            // Resolve or create GHL contact
            let contactId = client.ghlContactId;

            if (!contactId) {
                // Look up by email or phone
                const searchParam = client.email
                    ? `email=${encodeURIComponent(client.email)}`
                    : `phone=${encodeURIComponent(client.phone || '')}`;

                const searchRes = await fetch(
                    `https://services.leadconnectorhq.com/contacts/?locationId=${ghl.locationId}&${searchParam}`,
                    { headers: { Authorization: `Bearer ${ghl.apiKey}`, Version: '2021-07-28' } }
                );
                const searchData = await searchRes.json();
                contactId = searchData?.contacts?.[0]?.id ?? null;
            }

            if (!contactId) {
                logger.warn(`[GHL Service] applyTags: no GHL contact found for case ${caseId} — tags not applied`);
                return { success: false, error: 'GHL contact not found' };
            }

            // Persist contactId for future calls
            if (!client.ghlContactId) {
                await prisma.client.update({ where: { id: client.id }, data: { ghlContactId: contactId } });
            }

            // Apply tags via GHL Contacts API
            const tagRes = await fetch(
                `https://services.leadconnectorhq.com/contacts/${contactId}/tags`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${ghl.apiKey}`,
                        Version: '2021-07-28',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ tags }),
                }
            );

            if (!tagRes.ok) {
                const err = await tagRes.text();
                logger.error(`[GHL Service] applyTags failed for contact ${contactId}:`, err);
                return { success: false, error: err };
            }

            logger.info(`[GHL Service] Applied tags [${tags.join(', ')}] to GHL contact ${contactId} (case ${caseId})`);
            return { success: true };

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error('[GHL Service] applyTags error:', err);
            return { success: false, error: message };
        }
    }

    /**
     * Send specific documents from a case to a recipient via GHL.
     * @param caseId The ID of the case
     * @param types Array of document types to send (e.g. ['ID', 'POA'])
     * @param recipient Optional recipient email. If not provided, defaults to the case's Debt Counsellor email.
     * @param subject Optional email subject.
     * @param body Optional email body message.
     */
    static async sendDocuments(
        caseId: string,
        types: string[],
        recipient?: string,
        subject?: string,
        body?: string,
        cc?: string[],
    ): Promise<GhlSendResult> {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { documents: true },
        });

        if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

        // Resolve recipient
        const to = recipient || caseRecord.dcEmail;
        if (!to) {
            throw new Error(`No recipient provided and no Debt Counsellor email found for case ${caseId}`);
        }

        // Find relevant documents
        const docs = caseRecord.documents.filter(d => types.includes(d.type));
        if (docs.length === 0) {
            return { success: false, error: `No documents of type [${types.join(', ')}] found for case ${caseId}`, channel: 'EMAIL', recipient: to };
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://cases.zenowethu.co.za';
        const attachmentUrls = docs.map(d => `${baseUrl}${d.fileUrl}`);

        const messageBody = body || `Please find the requested documents (${types.join(', ')}) attached for case ${caseRecord.fileNumber}.`;
        const emailSubject = subject || `Documents for ${caseRecord.fileNumber}`;

        return this.sendMessage(caseId, 'EMAIL', messageBody, emailSubject, to, attachmentUrls, cc);
    }

    /**
     * Automatically generates an invoice for a case when fees are owed.
     */
    static async triggerInvoiceGeneration(caseId: string) {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });

        if (!caseRecord) return;

        // Check if a draft invoice already exists for this case to avoid duplicates
        const existingInvoice = await prisma.invoice.findFirst({
            where: { caseId, status: 'DRAFT' },
        });

        if (existingInvoice) {
            logger.info(`[GHL Service] Draft invoice already exists for case ${caseId}`);
            return;
        }

        const year = new Date().getFullYear();
        const count = await prisma.invoice.count({
            where: { invoiceNumber: { startsWith: `INV-${year}-` } }
        });
        const seq = String(count + 1).padStart(4, '0');
        const invoiceNumber = `INV-${year}-${seq}`;

        // Standard Fee Clearance Line Item
        const lineItems = [
            {
                description: 'Debt Review Fee Clearance / Archive Retrieval Fee',
                quantity: 1,
                unitPrice: 550, // Standard fee
            }
        ];

        const subtotal = 550;
        const vatRate = 0.15;
        const vatAmount = subtotal * vatRate;
        const total = subtotal + vatAmount;

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber,
                clientId: caseRecord.clientId,
                caseId: caseRecord.id,
                lineItems: lineItems as any,
                subtotal,
                vatRate,
                vatAmount,
                total,
                status: 'DRAFT',
                dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                notes: 'Generated automatically following Debt Counsellor request for fee clearance.',
                publicToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            }
        });

        logger.info(`[GHL Service] Created invoice ${invoice.invoiceNumber} for case ${caseRecord.id}`);

        // Notify client
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cases.zenowethu.co.za';
        const invoiceUrl = `${baseUrl}/finance/invoices/public/${invoice.publicToken}`;
        
        await this.sendMessage(
            caseId, 
            'EMAIL', 
            `Hello ${caseRecord.client.firstName},\n\nThe Debt Counsellor has requested fee clearance before they can release your file. We have generated an invoice for the retrieval fee.\n\nYou can view and pay your invoice here: ${invoiceUrl}\n\nPlease send us the proof of payment once settled so we can proceed with your application.`,
            'Action Required: Fee Clearance Invoice'
        );
    }

    /**
     * Sends a formal file request to the Debt Counsellor with the signed POA and ID attached.
     * CCs the client on the email and sends them a WhatsApp/SMS to keep them informed.
     */
    static async requestFileFromDC(caseId: string) {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true },
        });

        if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

        const { client } = caseRecord;

        const subject = `File Request: ${client.firstName} ${client.lastName} (${client.idNumber})`;
        const body = `Dear Debt Counsellor,\n\nPlease find attached the signed Power of Attorney and ID copy for our client, ${client.firstName} ${client.lastName}.\n\nWe kindly request that you provide us with the latest 17.W and any relevant court orders or certificates for this client.\n\nRegards,\nZenowethu Debt Management`;

        // CC the client on the email to keep them in the loop
        const ccEmails: string[] = client.email ? [client.email] : [];

        const result = await this.sendDocuments(
            caseId,
            ['ID', 'POA', 'ZENOWETHU_POA'],
            undefined,   // recipient defaults to dcEmail
            subject,
            body,
            ccEmails,
        );

        if (result.success) {
            // Notify the client via WhatsApp or SMS
            const clientMsg = `Hi ${client.firstName}, we have submitted a file transfer request to your Debt Counsellor on your behalf. We will update you as soon as we receive your file. — Zenowethu Debt Management`;
            const notifChannel: 'WHATSAPP' | 'SMS' | null =
                client.whatsappNumber ? 'WHATSAPP' :
                client.phone ? 'SMS' : null;

            if (notifChannel) {
                this.sendMessage(caseId, notifChannel, clientMsg).catch(err =>
                    logger.warn('[GHL Service] Client file-request notification failed (non-critical):', err)
                );
            }

            // Apply GHL follow-up tag to trigger chase automation
            this.applyTags(caseId, ['dc_file_requested']).catch(err =>
                logger.warn('[GHL Service] Follow-up tag failed (non-critical):', err)
            );
        }

        return result;
    }
}
