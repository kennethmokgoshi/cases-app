import nodemailer from 'nodemailer';
import { logger } from '../logger';

// SMS and Email Provider Interfaces
// Abstraction layer for different notification providers

export interface SmsProvider {
    name: string;
    send(to: string, message: string): Promise<SmsResult>;
}

export interface EmailProvider {
    name: string;
    send(to: string, subject: string, htmlBody: string, textBody?: string, options?: { fromName?: string, fromEmail?: string }): Promise<EmailResult>;
}

export interface SmsResult {
    success: boolean;
    messageId?: string;
    contactId?: string;
    error?: string;
    provider: string;
}

export interface EmailResult {
    success: boolean;
    messageId?: string;
    contactId?: string;
    error?: string;
    provider: string;
}

// ===== MOCK PROVIDER (for development/testing) =====
export class MockSmsProvider implements SmsProvider {
    name = 'Mock SMS';

    async send(to: string, message: string): Promise<SmsResult> {
        logger.info(`📱 [MOCK SMS] To: ${to}`);
        logger.info(`📱 [MOCK SMS] Message: ${message}`);
        return {
            success: true,
            messageId: `mock-sms-${Date.now()}`,
            provider: this.name };
    }
}

export class MockEmailProvider implements EmailProvider {
    name = 'Mock Email';

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: { fromName?: string, fromEmail?: string }): Promise<EmailResult> {
        logger.info(`📧 [MOCK EMAIL] To: ${to}`);
        logger.info(`📧 [MOCK EMAIL] Subject: ${subject}`);
        logger.info(`📧 [MOCK EMAIL] Body: ${htmlBody.substring(0, 200)}...`);
        return {
            success: true,
            messageId: `mock-email-${Date.now()}`,
            provider: this.name };
    }
}

// ===== CLICKATELL SMS PROVIDER =====
export class ClickatellSmsProvider implements SmsProvider {
    name = 'Clickatell';
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async send(to: string, message: string): Promise<SmsResult> {
        try {
            // Format SA number: 0821234567 -> 27821234567
            const formattedNumber = to.startsWith('0')
                ? '27' + to.substring(1)
                : to;

            const response = await fetch('https://platform.clickatell.com/messages/http/send', {
                method: 'POST',
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' },
                body: JSON.stringify({
                    content: message,
                    to: [formattedNumber] }) });

            const data = await response.json();

            if (response.ok && data.messages?.[0]?.accepted) {
                return {
                    success: true,
                    messageId: data.messages[0].apiMessageId,
                    provider: this.name };
            }

            return {
                success: false,
                error: data.error || 'Unknown error',
                provider: this.name };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                provider: this.name };
        }
    }
}

// ===== RESEND EMAIL PROVIDER =====
export class ResendEmailProvider implements EmailProvider {
    name = 'Resend';
    private apiKey: string;
    private fromEmail: string;

    constructor(apiKey: string, fromEmail: string = 'notifications@zenowethu.co.za') {
        this.apiKey = apiKey;
        this.fromEmail = fromEmail;
    }

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: { fromName?: string, fromEmail?: string }): Promise<EmailResult> {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: this.fromEmail,
                    to: [to],
                    subject: subject,
                    html: htmlBody,
                    text: textBody || htmlBody.replace(/<[^>]*>/g, '') }) });

            const data = await response.json();

            if (response.ok && data.id) {
                return {
                    success: true,
                    messageId: data.id,
                    provider: this.name };
            }

            return {
                success: false,
                error: data.message || 'Unknown error',
                provider: this.name };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                provider: this.name };
        }
    }
}

// ===== SMTP EMAIL PROVIDER =====

export class SmtpEmailProvider implements EmailProvider {
    name = 'SMTP';
    private transporter: nodemailer.Transporter;
    private fromEmail: string;

    constructor(config: {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        fromEmail?: string;
    }) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure, // true for 465, false for other ports
            auth: config.auth,
            tls: {
                rejectUnauthorized: false // Often needed for self-signed or some hosting setups
            }
        });
        this.fromEmail = config.fromEmail || config.auth.user;
    }

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: { fromName?: string, fromEmail?: string }): Promise<EmailResult> {
        try {
            const info = await this.transporter.sendMail({
                from: this.fromEmail,
                to: to,
                subject: subject,
                html: htmlBody,
                text: textBody || htmlBody.replace(/<[^>]*>/g, '') });

            return {
                success: true,
                messageId: info.messageId,
                provider: this.name };
        } catch (error: any) {
            logger.error('SMTP Send Error:', error);
            return {
                success: false,
                error: error.message || 'Unknown SMTP error',
                provider: this.name };
        }
    }
}
// ===== WHATSAPP PROVIDER =====
export interface WhatsAppProvider {
    name: string;
    send(to: string, message: string): Promise<WhatsAppResult>;
}

export interface WhatsAppResult {
    success: boolean;
    messageId?: string;
    contactId?: string;
    error?: string;
    provider: string;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
    name = 'Mock WhatsApp';

    async send(to: string, message: string): Promise<WhatsAppResult> {
        logger.info(`📱 [MOCK WHATSAPP] To: ${to}`);
        logger.info(`📱 [MOCK WHATSAPP] Message: ${message}`);
        return {
            success: true,
            messageId: `mock-wa-${Date.now()}`,
            provider: this.name };
    }
}

// ===== TELEGRAM PROVIDER =====
export interface TelegramProvider {
    name: string;
    send(chatId: string, message: string): Promise<TelegramResult>;
}

export interface TelegramResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
}

export class MockTelegramProvider implements TelegramProvider {
    name = 'Mock Telegram';

    async send(chatId: string, message: string): Promise<TelegramResult> {
        logger.info(`✈️ [MOCK TELEGRAM] ChatId: ${chatId}`);
        logger.info(`✈️ [MOCK TELEGRAM] Message: ${message}`);
        return {
            success: true,
            messageId: `mock-tg-${Date.now()}`,
            provider: this.name };
    }
}
// ===== GOHIGHLEVEL (GHL) PROVIDERS — v2 API =====

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

class GhlBaseProvider {
    protected apiKey: string;
    protected locationId: string;

    constructor(apiKey: string, locationId: string) {
        this.apiKey = apiKey;
        this.locationId = locationId;
    }

    protected get headers() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Version': GHL_API_VERSION,
        };
    }

    protected async ensureContactId(to: string, type: 'phone' | 'email'): Promise<string | null> {
        const contactId = await this.getContactId(to, type);
        if (contactId) return contactId;
        logger.info(`[GHL] Contact not found for ${to}, creating...`);
        return this.createContact(to, type);
    }

    protected async getContactId(to: string, type: 'phone' | 'email'): Promise<string | null> {
        try {
            const param = type === 'phone' ? `phone=${encodeURIComponent(to)}` : `email=${encodeURIComponent(to)}`;
            const response = await fetch(
                `${GHL_BASE_URL}/contacts/?locationId=${this.locationId}&${param}`,
                { headers: this.headers }
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.contacts?.[0]?.id ?? null;
        } catch (error) {
            logger.error('[GHL] Contact lookup error:', error);
            return null;
        }
    }

    protected async createContact(value: string, type: 'phone' | 'email'): Promise<string | null> {
        try {
            const body: Record<string, string> = { locationId: this.locationId };
            if (type === 'phone') body.phone = value;
            else body.email = value;

            const response = await fetch(`${GHL_BASE_URL}/contacts/`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const err = await response.json();
                logger.error('[GHL] Create contact error:', err);
                return null;
            }
            const data = await response.json();
            return data.contact?.id ?? null;
        } catch (error) {
            logger.error('[GHL] Create contact exception:', error);
            return null;
        }
    }

    protected async sendMessage(
        contactId: string,
        message: string,
        type: 'SMS' | 'Email' | 'WhatsApp',
        subject?: string,
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            const body: Record<string, string> = { type, contactId, message };
            if (type === 'Email' && subject) body.subject = subject;

            const response = await fetch(`${GHL_BASE_URL}/conversations/messages`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
            });
            const data = await response.json();
            return {
                success: response.ok,
                messageId: data.messageId ?? data.conversationId ?? data.id,
                error: response.ok ? undefined : (data.message ?? 'GHL API error'),
            };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
}

export class GhlSmsProvider extends GhlBaseProvider implements SmsProvider {
    name = 'GoHighLevel';

    async send(to: string, message: string): Promise<SmsResult> {
        const contactId = await this.ensureContactId(to, 'phone');
        if (!contactId) return { success: false, error: 'Contact could not be found or created', provider: this.name };
        const res = await this.sendMessage(contactId, message, 'SMS');
        return { ...res, contactId, provider: this.name };
    }
}

export class GhlEmailProvider extends GhlBaseProvider implements EmailProvider {
    name = 'GoHighLevel';

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: { fromName?: string, fromEmail?: string }): Promise<EmailResult> {
        const contactId = await this.ensureContactId(to, 'email');
        if (!contactId) return { success: false, error: 'Contact could not be found or created', provider: this.name };
        const res = await this.sendMessage(contactId, htmlBody, 'Email', subject);
        return { ...res, contactId, provider: this.name };
    }
}

export class GhlWhatsAppProvider extends GhlBaseProvider implements WhatsAppProvider {
    name = 'GoHighLevel';

    async send(to: string, message: string): Promise<WhatsAppResult> {
        const contactId = await this.ensureContactId(to, 'phone');
        if (!contactId) return { success: false, error: 'Contact could not be found or created', provider: this.name };
        const res = await this.sendMessage(contactId, message, 'WhatsApp');
        return { ...res, contactId, provider: this.name };
    }
}

// ===== GHL WEBHOOK PROVIDERS =====
export class GhlWebhookSmsProvider implements SmsProvider {
    name = 'GHL Webhook';
    constructor(private webhookUrl: string) { }

    async send(to: string, message: string): Promise<SmsResult> {
        try {
            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'SMS',
                    phone: to,
                    message: message
                })
            });
            return { success: true, messageId: `wh-${Date.now()}`, provider: this.name };
        } catch (e: any) {
            return { success: false, error: e.message, provider: this.name };
        }
    }
}

export class GhlWebhookEmailProvider implements EmailProvider {
    name = 'GHL Webhook';
    constructor(private webhookUrl: string) { }

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: { fromName?: string, fromEmail?: string }): Promise<EmailResult> {
        try {
            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'EMAIL',
                    email: to,
                    subject: subject,
                    message: htmlBody,
                    from_name: options?.fromName,
                    from_email: options?.fromEmail
                })
            });
            return { success: true, messageId: `wh-${Date.now()}`, provider: this.name };
        } catch (e: any) {
            return { success: false, error: e.message, provider: this.name };
        }
    }
}

export class GhlWebhookWhatsAppProvider implements WhatsAppProvider {
    name = 'GHL Webhook';
    constructor(private webhookUrl: string) { }

    async send(to: string, message: string): Promise<WhatsAppResult> {
        try {
            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'WHATSAPP',
                    phone: to,
                    message: message
                })
            });
            return { success: true, messageId: `wh-${Date.now()}`, provider: this.name };
        } catch (e: any) {
            return { success: false, error: e.message, provider: this.name };
        }
    }
}
