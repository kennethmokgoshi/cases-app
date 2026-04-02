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
    GhlWebhookWhatsAppProvider } from './providers';
import {
    getTemplateByStatus,
    renderTemplate
} from './templates';
import { getGHLCredentials } from '../integrations';
import { logger } from '../logger';
import { draftLegalDocument } from '../ai/legal-secretary';
import type { DraftingAccount } from '../ai/legal-secretary';

// Configuration
const SMS_ENABLED = process.env.SMS_ENABLED === 'true';
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';

const COMPANY_NAME = process.env.COMPANY_NAME || 'Zenowethu Debt Management';
const COMPANY_PHONE = process.env.COMPANY_PHONE || '012 035 1824';
const VIRTUAL_ASSISTANT_NAME = process.env.VIRTUAL_ASSISTANT_NAME || 'Thandi';

// Initialize providers based on configuration
async function getSmsProvider(): Promise<SmsProvider> {
    if (process.env.GHL_SMS_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL) {
        return new GhlWebhookSmsProvider(process.env.GHL_SMS_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL || '');
    }
    const ghl = await getGHLCredentials();
    if (ghl.apiKey && ghl.locationId) {
        return new GhlSmsProvider(ghl.apiKey, ghl.locationId);
    }

    if (process.env.CLICKATELL_API_KEY) {
        return new ClickatellSmsProvider(process.env.CLICKATELL_API_KEY);
    }
    return new MockSmsProvider();
}

async function getEmailProvider(): Promise<EmailProvider> {
    // Priority 1: GHL webhook (explicit email override)
    if (process.env.GHL_EMAIL_WEBHOOK_URL) {
        return new GhlWebhookEmailProvider(process.env.GHL_EMAIL_WEBHOOK_URL);
    }

    // Priority 2: SMTP (preferred direct email provider)
    if (process.env.SMTP_HOST) {
        return new SmtpEmailProvider({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || ''
            },
            fromEmail: process.env.EMAIL_FROM || process.env.SMTP_FROM
        });
    }

    // Priority 3: Resend
    if (process.env.RESEND_API_KEY) {
        return new ResendEmailProvider(
            process.env.RESEND_API_KEY,
            process.env.EMAIL_FROM || process.env.SMTP_FROM || 'notifications@zenowethu.co.za'
        );
    }

    // Priority 4: GHL API (fallback — shares creds with SMS/WhatsApp)
    const ghl = await getGHLCredentials();
    if (ghl.apiKey && ghl.locationId) {
        return new GhlEmailProvider(ghl.apiKey, ghl.locationId);
    }

    return new MockEmailProvider();
}

async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
    if (process.env.GHL_WEBHOOK_URL) {
        return new GhlWebhookWhatsAppProvider(process.env.GHL_WEBHOOK_URL);
    }
    const ghl = await getGHLCredentials();
    if (ghl.apiKey && ghl.locationId) {
        return new GhlWhatsAppProvider(ghl.apiKey, ghl.locationId);
    }
    return new MockWhatsAppProvider();
}

async function getTelegramProvider(): Promise<TelegramProvider> {
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
    isCreatedByPartner?: boolean;  // true only when a B2B_PARTNER user created the case
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
        if (payload.isB2B && payload.isCreatedByPartner) {
            statusCodeForTemplate = 'NEW_LEAD_B2B';      // B2B partner user created the case
        } else if (!payload.isB2B) {
            statusCodeForTemplate = 'NEW_LEAD';           // Direct B2C intake
        } else {
            statusCodeForTemplate = 'NEW_LEAD_STAFF';     // Zenowethu staff captured a B2B lead
        }
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
        services: payload.services || 'Credit Repair',
        mainSource: payload.mainSource || payload.partnerName || COMPANY_NAME,
        dcName: payload.dcName || 'Debt Counsellor',
        idNumber: payload.idNumber || '',
        caseUrl: payload.caseUrl || '',
        projectName: payload.projectName || '',
        partnerUserName: payload.partnerUserName || payload.senderName || 'Partner' };

    return sendNotificationByTemplate(template, variables, payload);
}

/**
 * Send a custom manual message (not from a template)
 */
export async function sendManualMessage(
    caseId: string,
    channel: 'SMS' | 'EMAIL' | 'WHATSAPP',
    recipient: string,
    message: string,
    subject?: string
): Promise<NotificationResult> {
    const result: NotificationResult = {
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
            if (res.error) result.errors.push(res.error);
            await logNotification({
                caseId, channel, recipient, recipientType: 'CLIENT', statusCode: 'MANUAL', message,
                success: res.success, messageId: res.messageId, error: res.error, provider: res.provider
            });
        } else if (channel === 'EMAIL') {
            const provider = await getEmailProvider();
            const res = await provider.send(recipient, subject || 'Message from Zeno', message.replace(/\n/g, '<br>'), message);
            result.emailSuccess = res.success;
            result.emailMessageId = res.messageId;
            if (res.error) result.errors.push(res.error);
            await logNotification({
                caseId, channel, recipient, recipientType: 'CLIENT', statusCode: 'MANUAL', message: subject || message,
                success: res.success, messageId: res.messageId, error: res.error, provider: res.provider
            });
        } else if (channel === 'WHATSAPP') {
            const provider = await getWhatsAppProvider();
            const res = await provider.send(recipient, message);
            result.whatsappSuccess = res.success;
            result.whatsappMessageId = res.messageId;
            if (res.error) result.errors.push(res.error);
            await logNotification({
                caseId, channel, recipient, recipientType: 'CLIENT', statusCode: 'MANUAL', message,
                success: res.success, messageId: res.messageId, error: res.error, provider: res.provider
            });
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
        }
    }

    // 2. Send Email to client
    if (template.sendToClient && payload.clientEmail) {
        const emailSubject = renderTemplate(template.emailSubject, variables);
        const emailBody = renderTemplate(template.emailTemplate, variables);
        const htmlBody = emailBody.replace(/\n/g, '<br>');

        if (EMAIL_ENABLED) {
            const emailProvider = await getEmailProvider();
            const emailResult = await emailProvider.send(
                payload.clientEmail,
                emailSubject,
                htmlBody,
                emailBody, // textBody
                { fromName: payload.senderName, fromEmail: payload.senderEmail }
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
        }
    }

    // 5. Send to Debt Counsellor
    if (payload.dcEmail) {
        const emailSubject = renderTemplate(template.emailSubject, variables);
        const emailBody = renderTemplate(template.emailTemplate, variables);
        const htmlBody = emailBody.replace(/\n/g, '<br>');

        if (EMAIL_ENABLED) {
            const emailProvider = await getEmailProvider();
            const emailResult = await emailProvider.send(
                payload.dcEmail,
                emailSubject,
                htmlBody,
                emailBody
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
}

async function logNotification(entry: NotificationLogEntry): Promise<void> {
    try {
        await prisma.notificationLog.create({
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
                sentAt: new Date() } });
    } catch (error) {
        logger.error('Failed to log notification:', error);
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
            const res = await emailProvider.send(bureauEmail, bureauSubject, bureauBody.replace(/\n/g, '<br>'), bureauBody);

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

            if (!res.success) logger.error(`[FileRequest] Failed to email bureau ${bureauEmail}: ${res.error}`);
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

        const res = await emailProvider.send(cp.email, subject, body.replace(/\n/g, '<br>'), body);

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

        if (!res.success) logger.error(`[FileRequest] Failed to email provider ${cp.name} (${cp.email}): ${res.error}`);
    }

    logger.info(`[FileRequest] Sent ${bureauResults.filter(r => r.success).length}/${payload.creditBureauEmails.length} bureau emails, ${providerResults.filter(r => r.success).length}/${payload.creditProviderContacts.length} provider emails (aiDraft=${payload.useAiDraft ?? false})`);

    return { bureauResults, providerResults };
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
        const result = await emailProvider.send(notification.recipient, "Resend: Notification", notification.message);
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
        const res = await emailProvider.send(rec.email, subject, body.replace(/\n/g, '<br>'), body);

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
