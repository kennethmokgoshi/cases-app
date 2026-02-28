import { prisma } from '@zenowethu/database';
import { getGHLCredentials } from './ghl-config';
import { logger } from '@zenowethu/shared-lib';

export class GhlService {
    static async handleWebhook(payload: any) {
        logger.info('[GHL Webhook] Received payload:', JSON.stringify(payload, null, 2));

        const type = payload.type;

        if (type === 'InboundMessage' || payload.message) {
            return this.handleInboundMessage(payload);
        }

        return { success: true };
    }

    private static async handleInboundMessage(payload: any) {
        const message = payload.message || payload.body;
        const contactId = payload.contactId;
        const phone = payload.phone || payload.contact?.phone;
        const email = payload.email || payload.contact?.email;
        const channel = payload.channelType || 'SMS';

        if (!message || (!phone && !email)) {
            logger.warn('[GHL Webhook] Missing message or contact info');
            return { success: false, error: 'Incomplete payload' };
        }

        const caseRecord = await prisma.case.findFirst({
            where: {
                OR: [
                    { client: { phone: phone } },
                    { client: { email: email } },
                    { client: { phone: { endsWith: phone?.slice(-9) } } }
                ]
            },
            include: { client: true }
        });

        if (!caseRecord) {
            logger.warn('[GHL Webhook] No case found for contact:', { phone, email });
            return { success: false, error: 'Case not found' };
        }

        const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

        await prisma.caseComment.create({
            data: {
                caseId: caseRecord.id,
                userId: systemUser?.id || 'system',
                content: `[Inbound ${channel}] ${message}`,
                type: 'GHL',
                isInternal: false,
                activityType: 'INBOUND_MESSAGE',
                activityData: JSON.stringify({
                    channel,
                    contactId,
                    provider: 'GoHighLevel'
                })
            }
        });

        await this.sendAutoAcknowledgment(caseRecord.id, channel, phone, email);

        return { success: true, caseId: caseRecord.id };
    }

    private static async sendAutoAcknowledgment(caseId: string, channel: string, phone?: string, email?: string) {
        logger.info(`[GHL Webhook] sending auto-ack to ${phone || email} via ${channel}`);
    }

    static async sendMessage(caseId: string, channel: 'SMS' | 'EMAIL' | 'WHATSAPP', message: string, subject?: string) {
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: { client: true }
        });

        if (!caseRecord) throw new Error('Case not found');

        const ghl = await getGHLCredentials();
        if (!ghl.apiKey || !ghl.locationId) throw new Error('GHL not configured');

        // NOTE: GHL provider classes (GhlSmsProvider, GhlEmailProvider, GhlWhatsAppProvider)
        // are app-specific and imported in each app from their local notifications/providers path.
        // This service exposes the logic; apps wire in the providers as needed.
        logger.info(`[GHL Service] sendMessage called: caseId=${caseId}, channel=${channel}`);
    }
}
