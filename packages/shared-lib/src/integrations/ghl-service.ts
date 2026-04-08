import { prisma } from '@zenowethu/database';
import { getGHLCredentials } from './ghl-config';
import { logger } from '../logger';
import {
    GhlSmsProvider,
    GhlEmailProvider,
    GhlWhatsAppProvider,
} from '../notifications/providers';

export interface GhlSendResult {
    success: boolean;
    messageId?: string;
    contactId?: string;
    error?: string;
    channel: string;
    recipient: string;
}

export class GhlService {
    static async handleWebhook(payload: Record<string, unknown>) {
        logger.info('[GHL Webhook] Received payload:', JSON.stringify(payload, null, 2));

        const type = payload.type;

        if (type === 'InboundMessage' || payload.message) {
            return this.handleInboundMessage(payload);
        }

        return { success: true };
    }

    private static async handleInboundMessage(payload: Record<string, unknown>) {
        const contact = payload.contact as Record<string, unknown> | undefined;
        const message = (payload.message ?? payload.body) as string | undefined;
        const contactId = payload.contactId as string | undefined;
        const phone = (payload.phone ?? contact?.phone) as string | undefined;
        const email = (payload.email ?? contact?.email) as string | undefined;
        const channel = (payload.channelType ?? 'SMS') as string;

        if (!message || (!phone && !email)) {
            logger.warn('[GHL Webhook] Missing message or contact info');
            return { success: false, error: 'Incomplete payload' };
        }

        const caseRecord = await prisma.case.findFirst({
            where: {
                OR: [
                    { client: { phone: phone } },
                    { client: { email: email } },
                    { client: { phone: { endsWith: phone?.slice(-9) } } },
                ],
            },
            include: { client: true },
        });

        if (!caseRecord) {
            logger.warn('[GHL Webhook] No case found for contact:', { phone, email });
            return { success: false, error: 'Case not found' };
        }

        // Persist contactId on the Client if we now know it and didn't before
        if (contactId && !caseRecord.client.ghlContactId) {
            await prisma.client.update({
                where: { id: caseRecord.client.id },
                data: { ghlContactId: contactId },
            });
        }

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

        await prisma.caseComment.create({
            data: {
                caseId: caseRecord.id,
                userId: systemUser?.id ?? 'system',
                content: `[Inbound ${channel}] ${message}`,
                type: 'GHL',
                isInternal: false,
                activityType: 'INBOUND_MESSAGE',
                activityData: JSON.stringify({
                    channel,
                    contactId,
                    provider: 'GoHighLevel',
                }),
            },
        });

        // Notify AI Plan Engine of inbound event
        try {
            const pkgName = '@zenowethu/plan-engine';
            // @ts-ignore — plan-engine resolved at runtime via pnpm workspace
            const { handlePlanEvent } = await import(pkgName);
            await handlePlanEvent({
                caseId: caseRecord.id,
                planId: '',
                eventSource: 'GHL',
                eventType: channel.toUpperCase().includes('EMAIL') ? 'DOCUMENT_RECEIVED' : 'REPLY_RECEIVED',
                eventData: { channel, contactId, message, provider: 'GoHighLevel' },
                description: `Inbound ${channel} from ${caseRecord.client.firstName} ${caseRecord.client.lastName}: "${message.substring(0, 200)}${message.length > 200 ? '...' : ''}"`,
            });
        } catch (err) {
            logger.warn('[GHL Webhook] Plan event notification failed (non-critical):', err);
        }

        return { success: true, caseId: caseRecord.id };
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
        const to =
            channel === 'EMAIL'
                ? client.email
                : (client.whatsappNumber ?? client.phone);

        if (!to) {
            const missing = channel === 'EMAIL' ? 'email' : 'phone/whatsappNumber';
            throw new Error(`Client ${client.id} has no ${missing} — cannot send ${channel}`);
        }

        // Format SA numbers: 0821234567 → +27821234567
        const formattedTo =
            channel !== 'EMAIL' && to.startsWith('0')
                ? '+27' + to.substring(1)
                : to;

        let result: GhlSendResult;

        try {
            if (channel === 'SMS') {
                const provider = new GhlSmsProvider(ghl.apiKey, ghl.locationId);
                const res = await provider.send(formattedTo, message);
                result = { ...res, channel, recipient: formattedTo };
            } else if (channel === 'EMAIL') {
                const provider = new GhlEmailProvider(ghl.apiKey, ghl.locationId);
                const res = await provider.send(formattedTo, subject ?? 'Message from Zenowethu Debt Counsellors', message);
                result = { ...res, channel, recipient: formattedTo };
            } else {
                const provider = new GhlWhatsAppProvider(ghl.apiKey, ghl.locationId);
                const res = await provider.send(formattedTo, message);
                result = { ...res, channel, recipient: formattedTo };
            }

            // Persist the GHL contactId on the Client so future sends skip the lookup
            if (result.contactId && !client.ghlContactId) {
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
}
