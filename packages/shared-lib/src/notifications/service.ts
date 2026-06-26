// Main Notification Service
// Handles sending notifications through configured providers

import { prisma } from '@zenowethu/database';
import {
    SmsProvider,
    EmailProvider,
    WhatsAppProvider,
    TelegramProvider,
    MockSmsProvider,
    MockEmailProvider,
    MockWhatsAppProvider,
    MockTelegramProvider,
    ClickatellSmsProvider,
    ResendEmailProvider,
    SmtpEmailProvider,
    GhlSmsProvider,
    GhlEmailProvider,
    GhlWhatsAppProvider,
    GhlWebhookSmsProvider,
    GhlWebhookEmailProvider,
    GhlWebhookWhatsAppProvider,
    FallbackEmailProvider,
    TwilioSmsProvider,
    TwilioWhatsAppProvider,
    MetaWhatsAppProvider,
    TelegramBotProvider } from './providers';
import type { EmailOptions } from './providers';
import {
    getTemplateByStatus,
    renderTemplate,
    renderBrandedEmail
} from './templates';
import { getGHLCredentials, getSMTPCredentials } from '../integrations';
import { logger } from '../logger';
import { draftLegalDocument } from '../ai/legal-secretary';
import type { DraftingAccount } from '../ai/legal-secretary';

// Configuration — default all channels to ENABLED; set to 'false' to explicitly disable
const SMS_ENABLED = process.env.SMS_ENABLED !== 'false';
const EMAIL_ENABLED = process.env.EMAIL_ENABLED !== 'false';
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED !== 'false';
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true'; // Telegram off by default (no provider configured)
const EMAIL_BCC_ADDRESS = process.env.EMAIL_BCC_ADDRESS;

const COMPANY_NAME = process.env.COMPANY_NAME || 'Zenowethu Debt Management';
const COMPANY_PHONE = process.env.COMPANY_PHONE || '012 035 1824';
const VIRTUAL_ASSISTANT_NAME = process.env.VIRTUAL_ASSISTANT_NAME || 'Thandi';

// Helper: Add BCC to email options if configured
function addBccToOptions(options?: EmailOptions): EmailOptions {
    if (!EMAIL_BCC_ADDRESS) return options || {};
    return {
        ...options,
        bcc: options?.bcc ? [...options.bcc, EMAIL_BCC_ADDRESS] : [EMAIL_BCC_ADDRESS]
    };
}

// Initialize providers based on configuration.
// Set SMS_PROVIDER to force a specific gateway (ghl | clickatell | twilio | mock);
// when unset, providers are auto-detected in the order below (GHL first, then fallbacks).
async function getSmsProvider(): Promise<SmsProvider> {
    const choice = (process.env.SMS_PROVIDER || '').toLowerCase();
    const twilioReady = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM);

    // Explicit selection
    if (choice === 'twilio' && twilioReady) {
        return new TwilioSmsProvider(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, process.env.TWILIO_SMS_FROM!);
    }
    if (choice === 'clickatell' && process.env.CLICKATELL_API_KEY) {
        return new ClickatellSmsProvider(process.env.CLICKATELL_API_KEY);
    }
    if (choice === 'mock') {
        return new MockSmsProvider();
    }

    // GHL (explicit 'ghl' or auto-default)
    if (process.env.GHL_SMS_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL) {
        return new GhlWebhookSmsProvider(process.env.GHL_SMS_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL || '');
    }
    const ghl = await getGHLCredentials();
    if (ghl.apiKey && ghl.locationId) {
        return new GhlSmsProvider(ghl.apiKey, ghl.locationId);
    }

    // Auto-fallbacks when GHL is not configured
    if (twilioReady) {
        return new TwilioSmsProvider(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, process.env.TWILIO_SMS_FROM!);
    }
    if (process.env.CLICKATELL_API_KEY) {
        return new ClickatellSmsProvider(process.env.CLICKATELL_API_KEY);
    }
    return new MockSmsProvider();
}

// Set EMAIL_PROVIDER to force a specific email gateway (smtp | ghl | resend | mock);
// when unset, providers are auto-detected (GHL first when configured, then SMTP, then Resend).
// ⚠️ GHL is not yet set up in production — EMAIL_PROVIDER=smtp makes direct SMTP the primary
// path, so emails are not delayed by a failing GHL API call on every send.
async function getEmailProvider(): Promise<EmailProvider> {
    const choice = (process.env.EMAIL_PROVIDER || '').toLowerCase();
    const ghl = await getGHLCredentials();
    const smtp = await getSMTPCredentials();

    const buildSmtp = () => new SmtpEmailProvider({
        host:      smtp.host,
        port:      smtp.port,
        secure:    smtp.secure,
        auth:      { user: smtp.username, pass: smtp.password },
        fromEmail: smtp.fromEmail || undefined,
    });
    const buildResend = () => new ResendEmailProvider(
        process.env.RESEND_API_KEY!,
        smtp.fromEmail || 'notifications@zenowethu.co.za'
    );

    // Explicit selection — forces the chosen gateway when it is usable.
    // An unusable forced choice (e.g. EMAIL_PROVIDER=smtp with no SMTP host) falls through to auto-detect.
    if (choice === 'smtp' && smtp.host) return buildSmtp();
    if (choice === 'resend' && process.env.RESEND_API_KEY) return buildResend();
    if (choice === 'mock') return new MockEmailProvider();
    // choice === 'ghl' falls through to the GHL-first auto-detect below.

    // Priority 1: GHL API — primary channel so all replies route back through the GHL webhook,
    // giving the app full two-way conversation history and enabling AI auto-replies.
    // Wrapped with SMTP fallback so professional emails to DCs/bureaus still deliver when
    // GHL cannot find or create a contact for the recipient.
    if (ghl.apiKey && ghl.locationId) {
        const ghlProvider = new GhlEmailProvider(ghl.apiKey, ghl.locationId);
        if (smtp.host) {
            return new FallbackEmailProvider(ghlProvider, buildSmtp());
        }
        return ghlProvider;
    }

    // Priority 2: GHL webhook (fire-and-forget; depends on GHL workflow being configured for email)
    if (process.env.GHL_EMAIL_WEBHOOK_URL) {
        return new GhlWebhookEmailProvider(process.env.GHL_EMAIL_WEBHOOK_URL);
    }

    // Priority 3: SMTP — direct delivery for environments without GHL
    if (smtp.host) {
        return buildSmtp();
    }

    // Priority 4: Resend
    if (process.env.RESEND_API_KEY) {
        return buildResend();
    }

    return new MockEmailProvider();
}

// Set WHATSAPP_PROVIDER to force a specific gateway (ghl | twilio | meta | mock);
// when unset, providers are auto-detected (GHL first, then Twilio, then Meta).
async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
    const choice = (process.env.WHATSAPP_PROVIDER || '').toLowerCase();
    const twilioReady = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
    const metaReady = !!(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);

    const buildTwilio = () => new TwilioWhatsAppProvider(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, process.env.TWILIO_WHATSAPP_FROM!);
    const buildMeta = () => new MetaWhatsAppProvider(
        process.env.META_WHATSAPP_TOKEN!,
        process.env.META_WHATSAPP_PHONE_NUMBER_ID!,
        process.env.META_WHATSAPP_API_VERSION || 'v21.0',
        process.env.META_WHATSAPP_TEMPLATE || undefined,
        process.env.META_WHATSAPP_TEMPLATE_LANG || 'en',
    );

    // Explicit selection
    if (choice === 'twilio' && twilioReady) return buildTwilio();
    if (choice === 'meta' && metaReady) return buildMeta();
    if (choice === 'mock') return new MockWhatsAppProvider();

    // GHL (explicit 'ghl' or auto-default)
    if (process.env.GHL_WEBHOOK_URL) {
        return new GhlWebhookWhatsAppProvider(process.env.GHL_WEBHOOK_URL);
    }
    const ghl = await getGHLCredentials();
    if (ghl.apiKey && ghl.locationId) {
        return new GhlWhatsAppProvider(ghl.apiKey, ghl.locationId);
    }

    // Auto-fallbacks when GHL is not configured
    if (twilioReady) return buildTwilio();
    if (metaReady) return buildMeta();
    return new MockWhatsAppProvider();
}

async function getTelegramProvider(): Promise<TelegramProvider> {
    if (process.env.TELEGRAM_BOT_TOKEN) {
        return new TelegramBotProvider(process.env.TELEGRAM_BOT_TOKEN);
    }
    return new MockTelegramProvider();
}

export interface CreditProviderContact {
    name: string;
    email: string;
    accountNumbers: string[];  // accounts this provider holds for the consumer
    outstandingBalances?: Record<string, number>;  // accountNumber → balance (used by AI drafter)
}

export interface NotificationPayload {
    caseId: string;
    clientName: string;
    clientPhone?: string | null;
    clientEmail?: string | null;
    clientWhatsApp?: string | null;
    clientTelegram?: string | null;
    fileNumber: string;
    statusCode: string;
    partnerUserName?: string | null;
    partnerName?: string | null;
    partnerEmail?: string | null;
    isB2B: boolean;
    isCreatedByPartner?: boolean;  // retained for callers; no longer affects NEW_LEAD template choice (isB2B drives it)
    services?: string | null;
    mainSource?: string | null;
    dcName?: string | null;
    dcEmail?: string | null;
    idNumber?: string | null;
    caseUrl?: string | null;
    projectName?: string | null;
    senderName?: string;
    senderEmail?: string;
    // File request recipients (used for DHS post-acceptance outreach)
    creditBureauEmails?: string[];
    creditProviderContacts?: CreditProviderContact[];
}

export interface FileRequestResult {
    bureauResults: Array<{ email: string; success: boolean; error?: string }>;
    providerResults: Array<{ name: string; email: string; success: boolean; error?: string }>;
}

export interface NotificationResult {
    smsSuccess: boolean;
    emailSuccess: boolean;
    whatsappSuccess: boolean;
    telegramSuccess: boolean;
    smsMessageId?: string;
    emailMessageId?: string;
    whatsappMessageId?: string;
    telegramMessageId?: string;
    errors: string[];
    contactId?: string;
}

export async function sendStatusChangeNotification(
    payload: NotificationPayload
): Promise<NotificationResult> {
    const result: NotificationResult = {
        smsSuccess: false,
        emailSuccess: false,
        whatsappSuccess: false,
        telegramSuccess: false,
        errors: [] };

    let statusCodeForTemplate = payload.statusCode;
    if (payload.statusCode === 'NEW_LEAD') {
        // Any B2B referral gets the partner "received by {mainSource} Head Office" welcome,
        // whether a B2B partner user or Zenowethu staff captured the lead. Only direct
        // B2C intake uses the Zenowethu-branded welcome.
        statusCodeForTemplate = payload.isB2B ? 'NEW_LEAD_B2B' : 'NEW_LEAD';
    }

    const template = getTemplateByStatus(statusCodeForTemplate);

    if (!template) {
        logger.info(`📭 No notification template for status: ${payload.statusCode}`);
        return result;
    }

    const variables: Record<string, string> = {
        clientName: payload.clientName,
        fileNumber: payload.fileNumber,
        status: template.statusName,
        companyName: COMPANY_NAME,
        phone: COMPANY_PHONE,
        partnerName: payload.partnerName || '',
        virtualAssistantName: VIRTUAL_ASSISTANT_NAME,
        services: payload.services || '',
        mainSource: payload.mainSource || payload.partnerName || COMPANY_NAME,
        dcName: payload.dcName || 'Debt Counsellor',
        idNumber: payload.idNumber || '',
        caseUrl: payload.caseUrl || '',
        projectName: payload.projectName || '',
        partnerUserName: payload.partnerUserName || payload.senderName || 'Partner' };

    return sendNotificationByTemplate(template, variables, payload);
}

/**
 * Send a custom manual message (not from a template).
 * For EMAIL: supports `options.attachments` (public URLs) and `options.cc` (copied recipients).
 */
export async function sendManualMessage(
    caseId: string,
    channel: 'SMS' | 'EMAIL' | 'WHATSAPP',
    recipient: string,
    message: string,
    subject?: string,
    options?: {
        cc?: string[];
        attachments?: string[];  // public URLs — each provider resolves them appropriately
        senderId?: string;
    }
): Promise<NotificationResult & { logId?: string }> {
    const senderId = options?.senderId;
    const result: NotificationResult & { logId?: string } = {
        smsSuccess: false,
        emailSuccess: false,
        whatsappSuccess: false,
        telegramSuccess: false,
        errors: [] };

    try {
        if (channel === 'SMS') {
            const provider = await getSmsProvider();
            const res = await provider.send(recipient, message);
            result.smsSuccess = res.success;
            result.smsMessageId = res.messageId;
            result.contactId = (res as any).contactId;
            if (res.error) result.errors.push(res.error);
            result.logId = await logNotification({
                caseId, channel, recipient, recipientType: 'CLIENT', statusCode: 'MANUAL', message,
                success: res.success, messageId: res.messageId, error: res.error, provider: res.provider, senderId
            });
            if (!res.success) {
                await enqueueFailedNotification({ caseId, channel, recipient, body: message, error: res.error });
            }
        } else if (channel === 'EMAIL') {
            const provider = await getEmailProvider();

            const emailAttachments = options?.attachments?.length
                ? options.attachments.map(url => ({
                    filename: url.split('/').pop()?.split('?')[0] || 'document',
                    content:  '' as string,
                    url,
                  }))
                : undefined;

            const res = await provider.send(
                recipient,
                subject || 'Message from Zeno',
                message.replace(/\n/g, '<br>'),
                message,
                addBccToOptions({ attachments: emailAttachments, cc: options?.cc })
            );
            result.emailSuccess = res.success;
            result.emailMessageId = res.messageId;
            result.contactId = (res as any).contactId;
            if (res.error) result.errors.push(res.error);
            result.logId = await logNotification({
                caseId, channel, recipient, recipientType: 'CLIENT', statusCode: 'MANUAL', message: subject || message,
                success: res.success, messageId: res.messageId, error: res.error, provider: res.provider, senderId
            });
            if (!res.success) {
                await enqueueFailedNotification({
                    caseId, channel, recipient, subject, body: message, htmlBody: message.replace(/\n/g, '<br>'),
                    optionsJson: options ? JSON.stringify(options) : undefined, error: res.error
                });
            }
            // Log each CC recipient so they appear in notification history
            for (const ccAddr of (options?.cc ?? [])) {
                await logNotification({
                    caseId, channel, recipient: ccAddr, recipientType: 'CLIENT', statusCode: 'MANUAL_CC',
                    message: subject || message, success: res.success, messageId: res.messageId,
                    error: res.error, provider: res.provider, senderId
                });
            }
        } else if (channel === 'WHATSAPP') {
            const provider = await getWhatsAppProvider();
            const res = await provider.send(recipient, message);
            result.whatsappSuccess = res.success;
            result.whatsappMessageId = res.messageId;
            result.contactId = (res as any).contactId;
            if (res.error) result.errors.push(res.error);
            result.logId = await logNotification({
                caseId, channel, recipient, recipientType: 'CLIENT', statusCode: 'MANUAL', message,
                success: res.success, messageId: res.messageId, error: res.error, provider: res.provider, senderId
            });
            if (!res.success) {
                await enqueueFailedNotification({ caseId, channel, recipient, body: message, error: res.error });
            }
        }
    } catch (error: any) {
        result.errors.push(error.message);
    }

    return result;
}

async function sendNotificationByTemplate(
    template: any,
    variables: Record<string, string>,
    payload: NotificationPayload
): Promise<NotificationResult> {
    const result: NotificationResult = {
        smsSuccess: false,
        emailSuccess: false,
        whatsappSuccess: false,
        telegramSuccess: false,
        errors: [] };
    if (template.sendToClient && payload.clientPhone) {
        const smsMessage = renderTemplate(template.smsTemplate, variables);

        if (SMS_ENABLED) {
            const smsProvider = await getSmsProvider();
            const smsResult = await smsProvider.send(payload.clientPhone, smsMessage);

            result.smsSuccess = smsResult.success;
            result.smsMessageId = smsResult.messageId;

            if (!smsResult.success) {
                result.errors.push(`SMS failed: ${smsResult.error}`);
            }

            await logNotification({
                caseId: payload.caseId,
                channel: 'SMS',
                recipient: payload.clientPhone,
                recipientType: 'CLIENT',
                statusCode: payload.statusCode,
                message: smsMessage,
                success: smsResult.success,
                messageId: smsResult.messageId,
                error: smsResult.error,
                provider: smsResult.provider });
            if (!smsResult.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'SMS', recipient: payload.clientPhone, body: smsMessage, error: smsResult.error });
            }
        }
    }

    // 2. Send Email to client
    if (template.sendToClient && payload.clientEmail) {
        const emailSubject = renderTemplate(template.emailSubject, variables);
        const emailBody = renderTemplate(template.emailTemplate, variables);
        const htmlBody = emailBody.replace(/\n/g, '<br>');

        if (EMAIL_ENABLED) {
            const emailProvider = await getEmailProvider();
            
            // Wrap in branded template
            const brandedHtml = renderBrandedEmail(htmlBody, {
                title: emailSubject,
                previewText: emailBody.substring(0, 100) + '...',
                companyName: COMPANY_NAME
            });

            const emailResult = await emailProvider.send(
                payload.clientEmail,
                emailSubject,
                brandedHtml,
                emailBody, // textBody
                addBccToOptions({ fromName: payload.senderName, fromEmail: payload.senderEmail })
            );

            result.emailSuccess = emailResult.success;
            result.emailMessageId = emailResult.messageId;

            if (!emailResult.success) {
                result.errors.push(`Email failed: ${emailResult.error}`);
            }

            await logNotification({
                caseId: payload.caseId,
                channel: 'EMAIL',
                recipient: payload.clientEmail,
                recipientType: 'CLIENT',
                statusCode: payload.statusCode,
                message: emailSubject,
                success: emailResult.success,
                messageId: emailResult.messageId,
                error: emailResult.error,
                provider: emailResult.provider });
            if (!emailResult.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: payload.clientEmail, subject: emailSubject, body: emailBody, htmlBody: brandedHtml, error: emailResult.error });
            }
        }
    }

    // 3. Send WhatsApp to client
    if (template.sendToClient && payload.clientWhatsApp) {
        const waMessage = renderTemplate(template.smsTemplate, variables);

        if (WHATSAPP_ENABLED) {
            const waProvider = await getWhatsAppProvider();
            const waResult = await waProvider.send(payload.clientWhatsApp, waMessage);

            result.whatsappSuccess = waResult.success;
            result.whatsappMessageId = waResult.messageId;

            if (!waResult.success) {
                result.errors.push(`WhatsApp failed: ${waResult.error}`);
            }

            await logNotification({
                caseId: payload.caseId,
                channel: 'WHATSAPP',
                recipient: payload.clientWhatsApp,
                recipientType: 'CLIENT',
                statusCode: payload.statusCode,
                message: waMessage,
                success: waResult.success,
                messageId: waResult.messageId,
                error: waResult.error,
                provider: waResult.provider });
            if (!waResult.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'WHATSAPP', recipient: payload.clientWhatsApp, body: waMessage, error: waResult.error });
            }
        }
    }

    // 4. Send Telegram to client (only when explicitly enabled and a chat id is on file)
    if (template.sendToClient && payload.clientTelegram && template.smsTemplate && template.smsTemplate !== 'N/A') {
        const tgMessage = renderTemplate(template.smsTemplate, variables);

        if (TELEGRAM_ENABLED) {
            const tgProvider = await getTelegramProvider();
            const tgResult = await tgProvider.send(payload.clientTelegram, tgMessage);

            result.telegramSuccess = tgResult.success;
            result.telegramMessageId = tgResult.messageId;

            if (!tgResult.success) {
                result.errors.push(`Telegram failed: ${tgResult.error}`);
            }

            await logNotification({
                caseId: payload.caseId,
                channel: 'TELEGRAM',
                recipient: payload.clientTelegram,
                recipientType: 'CLIENT',
                statusCode: payload.statusCode,
                message: tgMessage,
                success: tgResult.success,
                messageId: tgResult.messageId,
                error: tgResult.error,
                provider: tgResult.provider });
            if (!tgResult.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'TELEGRAM', recipient: payload.clientTelegram, body: tgMessage, error: tgResult.error });
            }
        }
    }

    // 5. Send to Debt Counsellor
    if (payload.dcEmail) {
        const emailSubject = renderTemplate(template.emailSubject, variables);
        const emailBody = renderTemplate(template.emailTemplate, variables);
        const htmlBody = emailBody.replace(/\n/g, '<br>');

        if (EMAIL_ENABLED) {
            const emailProvider = await getEmailProvider();
            
            const brandedHtml = renderBrandedEmail(htmlBody, {
                title: emailSubject,
                previewText: emailBody.substring(0, 100) + '...',
                companyName: COMPANY_NAME
            });

            const emailResult = await emailProvider.send(
                payload.dcEmail,
                emailSubject,
                brandedHtml,
                emailBody,
                addBccToOptions({})
            );

            if (emailResult.success) {
                await logNotification({
                    caseId: payload.caseId,
                    channel: 'EMAIL',
                    recipient: payload.dcEmail,
                    recipientType: 'DEBT_COUNSELLOR',
                    statusCode: payload.statusCode,
                    message: emailSubject,
                    success: true,
                    messageId: emailResult.messageId,
                    provider: emailResult.provider });
            } else {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: payload.dcEmail, subject: emailSubject, body: emailBody, htmlBody: brandedHtml, error: emailResult.error });
            }
        }
    }

    return result;
}

interface NotificationLogEntry {
    caseId: string;
    channel: string;
    recipient: string;
    recipientType: 'CLIENT' | 'PARTNER' | 'STAFF' | 'DEBT_COUNSELLOR' | 'MANAGER' | 'ADMIN';
    statusCode: string;
    message: string;
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
    senderId?: string;
}

async function logNotification(entry: NotificationLogEntry): Promise<string | undefined> {
    try {
        const record = await prisma.notificationLog.create({
            data: {
                caseId: entry.caseId,
                channel: entry.channel,
                recipient: entry.recipient,
                recipientType: entry.recipientType,
                statusCode: entry.statusCode,
                message: entry.message,
                success: entry.success,
                externalId: entry.messageId || null,
                error: entry.error || null,
                provider: entry.provider,
                senderId: entry.senderId || null,
                sentAt: new Date() } });
        return record.id;
    } catch (error) {
        logger.error('Failed to log notification:', error);
        return undefined;
    }
}

/**
 * Send file request emails to Credit Bureaus and Credit Providers after DHS acceptance.
 * Each credit provider receives a tailored email listing their specific account numbers.
 */
export async function sendFileRequestEmails(payload: {
    caseId: string;
    clientName: string;
    idNumber: string;
    fileNumber: string;
    senderName?: string;
    creditBureauEmails: string[];
    creditProviderContacts: CreditProviderContact[];
    // AI drafting
    useAiDraft?: boolean;
    allAccounts?: DraftingAccount[];  // full account list used for bureau AI drafts
}): Promise<FileRequestResult> {
    const bureauTemplate = getTemplateByStatus('REQUEST_FILE_CREDIT_BUREAU');
    const providerTemplate = getTemplateByStatus('REQUEST_FILE_CREDIT_PROVIDER');

    const emailProvider = await getEmailProvider();

    const bureauResults: FileRequestResult['bureauResults'] = [];
    const providerResults: FileRequestResult['providerResults'] = [];

    const baseVariables = {
        clientName: payload.clientName,
        idNumber: payload.idNumber,
        fileNumber: payload.fileNumber,
        companyName: COMPANY_NAME,
        phone: COMPANY_PHONE,
        senderName: payload.senderName || COMPANY_NAME,
        accountNumbers: '',
    };

    const clientParts = payload.clientName.split(' ');
    const draftingClient = {
        firstName: clientParts[0] || payload.clientName,
        lastName:  clientParts.slice(1).join(' ') || '',
        idNumber:  payload.idNumber,
    };

    // --- Credit Bureaus ---
    // AI: one draft for all bureaus (same content), with template fallback
    let bureauSubject: string;
    let bureauBody: string;
    let bureauDraftedByAi = false;

    if (payload.useAiDraft && bureauTemplate) {
        try {
            const draft = await draftLegalDocument({
                client:       draftingClient,
                caseData:     { fileNumber: payload.fileNumber },
                matter:       { type: 'Debt Review Flag Removal', creditorName: 'Credit Bureau' },
                documentType: 'BUREAU_FILE_REQUEST',
                accounts:     payload.allAccounts,
                senderName:   payload.senderName,
                companyName:  COMPANY_NAME,
                companyPhone: COMPANY_PHONE,
            });
            bureauSubject     = draft.subject;
            bureauBody        = draft.content;
            bureauDraftedByAi = true;
            logger.info('[FileRequest] AI-drafted bureau letter successfully');
        } catch (aiErr) {
            logger.warn('[FileRequest] AI bureau draft failed — falling back to template:', aiErr);
            bureauSubject = bureauTemplate ? renderTemplate(bureauTemplate.emailSubject, baseVariables) : '';
            bureauBody    = bureauTemplate ? renderTemplate(bureauTemplate.emailTemplate, baseVariables) : '';
        }
    } else if (bureauTemplate) {
        bureauSubject = renderTemplate(bureauTemplate.emailSubject, baseVariables);
        bureauBody    = renderTemplate(bureauTemplate.emailTemplate, baseVariables);
    } else {
        bureauSubject = '';
        bureauBody    = '';
    }

    if (bureauSubject) {
        for (const bureauEmail of payload.creditBureauEmails) {
            const brandedHtml = renderBrandedEmail(bureauBody.replace(/\n/g, '<br>'), {
                title: bureauSubject,
                previewText: bureauBody.substring(0, 100) + '...',
                companyName: COMPANY_NAME
            });

            const res = await emailProvider.send(bureauEmail, bureauSubject, brandedHtml, bureauBody, addBccToOptions({}));

            bureauResults.push({ email: bureauEmail, success: res.success, error: res.error });

            await logNotification({
                caseId:        payload.caseId,
                channel:       'EMAIL',
                recipient:     bureauEmail,
                recipientType: 'PARTNER',
                statusCode:    'REQUEST_FILE_CREDIT_BUREAU',
                message:       `${bureauDraftedByAi ? '[AI] ' : ''}${bureauSubject}`,
                success:       res.success,
                messageId:     res.messageId,
                error:         res.error,
                provider:      res.provider,
            });

            if (!res.success) {
                logger.error(`[FileRequest] Failed to email bureau ${bureauEmail}: ${res.error}`);
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: bureauEmail, subject: bureauSubject, body: bureauBody, htmlBody: brandedHtml, error: res.error });
            }
        }
    }

    // --- Credit Providers ---
    // AI: one draft per provider (personalised with their accounts), with template fallback
    for (const cp of payload.creditProviderContacts) {
        let subject: string;
        let body: string;
        let draftedByAi = false;

        const providerAccounts: DraftingAccount[] = cp.accountNumbers.map(num => ({
            creditorName:       cp.name,
            accountNumber:      num,
            outstandingBalance: cp.outstandingBalances?.[num],
        }));

        if (payload.useAiDraft) {
            try {
                const draft = await draftLegalDocument({
                    client:       draftingClient,
                    caseData:     { fileNumber: payload.fileNumber },
                    matter:       { type: 'Debt Review Flag Removal', creditorName: cp.name, accountNumber: cp.accountNumbers[0] || null },
                    documentType: 'PROVIDER_FILE_REQUEST',
                    accounts:     providerAccounts,
                    senderName:   payload.senderName,
                    companyName:  COMPANY_NAME,
                    companyPhone: COMPANY_PHONE,
                });
                subject     = draft.subject;
                body        = draft.content;
                draftedByAi = true;
                logger.info(`[FileRequest] AI-drafted provider letter for ${cp.name}`);
            } catch (aiErr) {
                logger.warn(`[FileRequest] AI provider draft failed for ${cp.name} — falling back to template:`, aiErr);
                const vars = { ...baseVariables, accountNumbers: cp.accountNumbers.join(', ') };
                subject = providerTemplate ? renderTemplate(providerTemplate.emailSubject, vars) : '';
                body    = providerTemplate ? renderTemplate(providerTemplate.emailTemplate, vars) : '';
            }
        } else if (providerTemplate) {
            const vars = { ...baseVariables, accountNumbers: cp.accountNumbers.join(', ') };
            subject = renderTemplate(providerTemplate.emailSubject, vars);
            body    = renderTemplate(providerTemplate.emailTemplate, vars);
        } else {
            subject = '';
            body    = '';
        }

        if (!subject) continue;

        const brandedHtml = renderBrandedEmail(body.replace(/\n/g, '<br>'), {
            title: subject,
            previewText: body.substring(0, 100) + '...',
            companyName: COMPANY_NAME
        });

        const res = await emailProvider.send(cp.email, subject, brandedHtml, body, addBccToOptions({}));

        providerResults.push({ name: cp.name, email: cp.email, success: res.success, error: res.error });

        await logNotification({
            caseId:        payload.caseId,
            channel:       'EMAIL',
            recipient:     cp.email,
            recipientType: 'PARTNER',
            statusCode:    'REQUEST_FILE_CREDIT_PROVIDER',
            message:       `${draftedByAi ? '[AI] ' : ''}${subject}`,
            success:       res.success,
            messageId:     res.messageId,
            error:         res.error,
            provider:      res.provider,
        });

        if (!res.success) {
            logger.error(`[FileRequest] Failed to email provider ${cp.name} (${cp.email}): ${res.error}`);
            await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: cp.email, subject: subject, body: body, htmlBody: brandedHtml, error: res.error });
        }
    }

    logger.info(`[FileRequest] Sent ${bureauResults.filter(r => r.success).length}/${payload.creditBureauEmails.length} bureau emails, ${providerResults.filter(r => r.success).length}/${payload.creditProviderContacts.length} provider emails (aiDraft=${payload.useAiDraft ?? false})`);

    return { bureauResults, providerResults };
}

/**
 * Specialized Debt Review Removal (DRR) file request.
 * Dispatches formal requests to:
 * 1. The Debt Counsellor (requesting 17.W and Court Orders)
 * 2. Credit Bureaus (standard request + flag removal query)
 * 3. Credit Providers (standard request + clearance query)
 */
export async function sendDrrRequestEmails(payload: {
    caseId: string;
    clientName: string;
    idNumber: string;
    fileNumber: string;
    senderName?: string;
    dcName?: string | null;
    dcEmail?: string | null;
    creditBureauEmails: string[];
    creditProviderContacts: CreditProviderContact[];
    allAccounts?: DraftingAccount[];
}): Promise<FileRequestResult & { dcSent: boolean }> {
    const emailProvider = await getEmailProvider();
    const clientParts = payload.clientName.split(' ');
    const draftingClient = {
        firstName: clientParts[0] || payload.clientName,
        lastName:  clientParts.slice(1).join(' ') || '',
        idNumber:  payload.idNumber,
    };

    let dcSent = false;
    const bureauResults: FileRequestResult['bureauResults'] = [];
    const providerResults: FileRequestResult['providerResults'] = [];

    // 1. Request from Debt Counsellor
    if (payload.dcEmail) {
        try {
            const draft = await draftLegalDocument({
                client: draftingClient,
                caseData: { fileNumber: payload.fileNumber },
                matter: { type: 'Debt Review Removal', creditorName: payload.dcName || 'Debt Counsellor' },
                documentType: 'DC_DRR_FILE_REQUEST',
                senderName: payload.senderName,
                companyName: COMPANY_NAME,
                companyPhone: COMPANY_PHONE,
            });

            const res = await emailProvider.send(payload.dcEmail, draft.subject, draft.content.replace(/\n/g, '<br>'), draft.content, addBccToOptions({}));
            dcSent = res.success;

            await logNotification({
                caseId: payload.caseId,
                channel: 'EMAIL',
                recipient: payload.dcEmail,
                recipientType: 'DEBT_COUNSELLOR',
                statusCode: 'REQUEST_DRR_FILES_DC',
                message: `[AI] ${draft.subject}`,
                success: res.success,
                messageId: res.messageId,
                error: res.error,
                provider: res.provider,
            });
            if (!res.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: payload.dcEmail, subject: draft.subject, body: draft.content, htmlBody: draft.content.replace(/\n/g, '<br>'), error: res.error });
            }
        } catch (err) {
            logger.error(`[DRRRequest] Failed to draft or send DC letter for case ${payload.caseId}:`, err);
        }
    }

    // 2. Request from Bureaus (Always use AI for DRR context)
    for (const bureauEmail of payload.creditBureauEmails) {
        try {
            const draft = await draftLegalDocument({
                client: draftingClient,
                caseData: { fileNumber: payload.fileNumber },
                matter: { type: 'Debt Review Removal', creditorName: 'Credit Bureau' },
                documentType: 'BUREAU_FILE_REQUEST',
                accounts: payload.allAccounts,
                senderName: payload.senderName,
                companyName: COMPANY_NAME,
                companyPhone: COMPANY_PHONE,
            });

            const res = await emailProvider.send(bureauEmail, draft.subject, draft.content.replace(/\n/g, '<br>'), draft.content, addBccToOptions({}));
            bureauResults.push({ email: bureauEmail, success: res.success, error: res.error });

            await logNotification({
                caseId: payload.caseId,
                channel: 'EMAIL',
                recipient: bureauEmail,
                recipientType: 'PARTNER',
                statusCode: 'REQUEST_DRR_FILES_BUREAU',
                message: `[AI] ${draft.subject}`,
                success: res.success,
                messageId: res.messageId,
                error: res.error,
                provider: res.provider,
            });
            if (!res.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: bureauEmail, subject: draft.subject, body: draft.content, htmlBody: draft.content.replace(/\n/g, '<br>'), error: res.error });
            }
        } catch (err) {
            bureauResults.push({ email: bureauEmail, success: false, error: 'Drafting failed' });
        }
    }

    // 3. Request from Providers
    for (const cp of payload.creditProviderContacts) {
        try {
            const providerAccounts: DraftingAccount[] = cp.accountNumbers.map(num => ({
                creditorName: cp.name,
                accountNumber: num,
                outstandingBalance: cp.outstandingBalances?.[num],
            }));

            const draft = await draftLegalDocument({
                client: draftingClient,
                caseData: { fileNumber: payload.fileNumber },
                matter: { type: 'Debt Review Removal', creditorName: cp.name },
                documentType: 'PROVIDER_FILE_REQUEST',
                accounts: providerAccounts,
                senderName: payload.senderName,
                companyName: COMPANY_NAME,
                companyPhone: COMPANY_PHONE,
            });

            const res = await emailProvider.send(cp.email, draft.subject, draft.content.replace(/\n/g, '<br>'), draft.content, addBccToOptions({}));
            providerResults.push({ name: cp.name, email: cp.email, success: res.success, error: res.error });

            await logNotification({
                caseId: payload.caseId,
                channel: 'EMAIL',
                recipient: cp.email,
                recipientType: 'PARTNER',
                statusCode: 'REQUEST_DRR_FILES_PROVIDER',
                message: `[AI] ${draft.subject}`,
                success: res.success,
                messageId: res.messageId,
                error: res.error,
                provider: res.provider,
            });
            if (!res.success) {
                await enqueueFailedNotification({ caseId: payload.caseId, channel: 'EMAIL', recipient: cp.email, subject: draft.subject, body: draft.content, htmlBody: draft.content.replace(/\n/g, '<br>'), error: res.error });
            }
        } catch (err) {
            providerResults.push({ name: cp.name, email: cp.email, success: false, error: 'Drafting failed' });
        }
    }

    return { bureauResults, providerResults, dcSent };
}

export async function getNotificationHistory(caseId: string) {
    return prisma.notificationLog.findMany({
        where: { caseId },
        orderBy: { sentAt: 'desc' } });
}

export async function resendNotification(
    notificationId: string
): Promise<NotificationResult> {
    const notification = await prisma.notificationLog.findUnique({
        where: { id: notificationId },
        include: {
            case: {
                include: { client: true }
            }
        }
    });

    if (!notification) {
        return {
            smsSuccess: false,
            emailSuccess: false,
            whatsappSuccess: false,
            telegramSuccess: false,
            errors: ['Notification not found'] };
    }

    const resultTemplate: NotificationResult = {
        smsSuccess: false,
        emailSuccess: false,
        whatsappSuccess: false,
        telegramSuccess: false,
        errors: []
    };

    if (notification.channel === 'SMS') {
        const smsProvider = await getSmsProvider();
        const result = await smsProvider.send(notification.recipient, notification.message);
        await logResend(notification, result, 'SMS');
        return { ...resultTemplate, smsSuccess: result.success, smsMessageId: result.messageId, errors: result.error ? [result.error] : [] };
    } else if (notification.channel === 'EMAIL') {
        const emailProvider = await getEmailProvider();
        const result = await emailProvider.send(notification.recipient, "Resend: Notification", notification.message, undefined, addBccToOptions({}));
        await logResend(notification, result, 'EMAIL');
        return { ...resultTemplate, emailSuccess: result.success, emailMessageId: result.messageId, errors: result.error ? [result.error] : [] };
    } else if (notification.channel === 'WHATSAPP') {
        const waProvider = await getWhatsAppProvider();
        const result = await waProvider.send(notification.recipient, notification.message);
        await logResend(notification, result, 'WHATSAPP');
        return { ...resultTemplate, whatsappSuccess: result.success, whatsappMessageId: result.messageId, errors: result.error ? [result.error] : [] };
    }

    return { ...resultTemplate, errors: ['Unsupported channel for resend'] };
}

async function logResend(original: any, result: any, channel: string) {
    await logNotification({
        caseId: original.caseId,
        channel: channel,
        recipient: original.recipient,
        recipientType: original.recipientType as any,
        statusCode: original.statusCode,
        message: original.message,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
        provider: result.provider });
}

export async function sendInternalNotification(entry: {
    caseId?: string;
    userId?: string;
    role?: 'MANAGER' | 'ADMIN';
    statusCode: string;
    variables: Record<string, string>;
}): Promise<void> {
    const template = getTemplateByStatus(entry.statusCode);
    if (!template) return;

    const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const caseUrl = entry.caseId ? `${APP_URL}/cases/${entry.caseId}` : '';

    const variables = {
        ...entry.variables,
        companyName: COMPANY_NAME,
        phone: COMPANY_PHONE,
        caseUrl: caseUrl };

    let recipients: { email: string; phone?: string | null; type: any }[] = [];

    if (entry.userId) {
        const user = await prisma.user.findUnique({ where: { id: entry.userId } });
        if (user) recipients.push({ email: user.email, phone: (user as any).phone || null, type: user.role });
    } else if (entry.role === 'ADMIN') {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        admins.forEach(a => recipients.push({ email: a.email, phone: (a as any).phone || null, type: 'ADMIN' }));
    }

    const emailProvider = await getEmailProvider();
    const smsProvider = await getSmsProvider();

    for (const rec of recipients) {
        const subject = renderTemplate(template.emailSubject, variables);
        const body = renderTemplate(template.emailTemplate, variables);
        const res = await emailProvider.send(rec.email, subject, body.replace(/\n/g, '<br>'), body, addBccToOptions({}));

        await logNotification({
            caseId: entry.caseId || 'SYSTEM',
            channel: 'EMAIL',
            recipient: rec.email,
            recipientType: rec.type,
            statusCode: entry.statusCode,
            message: subject,
            success: res.success,
            provider: res.provider });

        if (template.isUrgent && rec.phone && SMS_ENABLED) {
            const smsMsg = renderTemplate(template.smsTemplate, variables);
            const smsRes = await smsProvider.send(rec.phone, smsMsg);
            await logNotification({
                caseId: entry.caseId || 'SYSTEM',
                channel: 'SMS',
                recipient: rec.phone,
                recipientType: rec.type,
                statusCode: entry.statusCode,
                message: smsMsg,
                success: smsRes.success,
                provider: smsRes.provider });
        }
    }
}

export async function findManagersForCase(caseId: string): Promise<string[]> {
    const caseObj = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
            projects: {
                include: {
                    project: {
                        include: {
                            members: {
                                where: { role: 'MANAGER' }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!caseObj) return [];

    const managerIds = new Set<string>();
    caseObj.projects.forEach(cp => {
        cp.project.members.forEach(m => {
            managerIds.add(m.userId);
        });
    });

    return Array.from(managerIds);
}

export async function enqueueFailedNotification(data: {
    caseId: string;
    channel: string;
    recipient: string;
    subject?: string;
    body: string;
    htmlBody?: string;
    optionsJson?: string;
    error?: string;
}) {
    if (data.caseId === 'SYSTEM') return; // Don't queue pure system alerts
    const errText = data.error?.toLowerCase() || '';
    const isPermanent = errText.includes('invalid') || 
                        errText.includes('not found') || 
                        errText.includes('unsubscribed') ||
                        errText.includes('missing') ||
                        errText.includes('bounce');
    
    try {
        await prisma.notificationQueue.create({
            data: {
                caseId: data.caseId,
                channel: data.channel,
                recipient: data.recipient,
                subject: data.subject,
                body: data.body,
                htmlBody: data.htmlBody,
                optionsJson: data.optionsJson,
                lastError: data.error,
                status: isPermanent ? 'HUMAN_REVIEW' : 'PENDING_RETRY',
                nextRetryAt: isPermanent ? null : new Date(Date.now() + 5 * 60 * 1000)
            }
        });
    } catch (err) {
        logger.error('Failed to enqueue notification', err);
    }
}

export async function executeNotificationRetry(queueId: string): Promise<NotificationResult> {
    const queueItem = await prisma.notificationQueue.findUnique({ where: { id: queueId } });
    if (!queueItem) throw new Error('Queue item not found');

    const result: NotificationResult = {
        smsSuccess: false, emailSuccess: false, whatsappSuccess: false, telegramSuccess: false, errors: []
    };

    const options = queueItem.optionsJson ? JSON.parse(queueItem.optionsJson) : undefined;

    try {
        if (queueItem.channel === 'SMS') {
            const provider = await getSmsProvider();
            const res = await provider.send(queueItem.recipient, queueItem.body);
            result.smsSuccess = res.success;
            if (res.error) result.errors.push(res.error);
        } else if (queueItem.channel === 'EMAIL') {
            const provider = await getEmailProvider();
            const emailAttachments = options?.attachments?.length ? options.attachments.map((url: string) => ({
                filename: url.split('/').pop()?.split('?')[0] || 'document',
                content: '',
                url
            })) : undefined;
            const res = await provider.send(
                queueItem.recipient,
                queueItem.subject || 'Message from Zeno',
                queueItem.htmlBody || queueItem.body.replace(/\n/g, '<br>'),
                queueItem.body,
                addBccToOptions({ attachments: emailAttachments, cc: options?.cc })
            );
            result.emailSuccess = res.success;
            if (res.error) result.errors.push(res.error);
        } else if (queueItem.channel === 'WHATSAPP') {
            const provider = await getWhatsAppProvider();
            const res = await provider.send(queueItem.recipient, queueItem.body);
            result.whatsappSuccess = res.success;
            if (res.error) result.errors.push(res.error);
        } else if (queueItem.channel === 'TELEGRAM') {
            const provider = await getTelegramProvider();
            const res = await provider.send(queueItem.recipient, queueItem.body);
            result.telegramSuccess = res.success;
            if (res.error) result.errors.push(res.error);
        }
    } catch (error: any) {
        result.errors.push(error.message);
    }

    const success = result.smsSuccess || result.emailSuccess || result.whatsappSuccess || result.telegramSuccess;
    
    if (success) {
        await prisma.notificationQueue.update({
            where: { id: queueId },
            data: { status: 'SUCCESS', retryCount: { increment: 1 }, lastError: null }
        });
        await logNotification({
            caseId: queueItem.caseId,
            channel: queueItem.channel,
            recipient: queueItem.recipient,
            recipientType: 'CLIENT', // Simplified
            statusCode: 'RETRY',
            message: queueItem.subject || queueItem.body,
            success: true,
            provider: 'RETRY'
        });
    } else {
        const newCount = queueItem.retryCount + 1;
        await prisma.notificationQueue.update({
            where: { id: queueId },
            data: {
                status: newCount >= 3 ? 'HUMAN_REVIEW' : 'PENDING_RETRY',
                retryCount: newCount,
                lastError: result.errors.join(', '),
                nextRetryAt: newCount >= 3 ? null : new Date(Date.now() + 5 * 60 * 1000)
            }
        });
    }

    return result;
}


