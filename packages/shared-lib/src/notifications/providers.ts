import nodemailer from 'nodemailer';
import { logger } from '../logger';

// SMS and Email Provider Interfaces
// Abstraction layer for different notification providers

/**
 * Normalise a South African (or already-international) mobile number to E.164.
 *   0821234567   -> +27821234567
 *   27821234567  -> +27821234567
 *   +27821234567 -> +27821234567 (unchanged)
 * Numbers that are already international (+XX) are left as-is.
 */
export function toZaE164(raw: string): string {
    const trimmed = (raw || '').replace(/[\s\-()]/g, '');
    if (trimmed.startsWith('+')) return trimmed;
    if (trimmed.startsWith('0')) return '+27' + trimmed.substring(1);
    if (trimmed.startsWith('27')) return '+' + trimmed;
    return trimmed;
}

export interface SmsProvider {
    name: string;
    send(to: string, message: string): Promise<SmsResult>;
}

export interface EmailAttachment {
    filename: string;
    content:  Buffer | string; // Use Buffer for SMTP, base64 string for Resend
    contentType?: string;
    url?: string; // Public URL for providers that send by reference (GHL, Resend external)
}

export interface EmailOptions {
    fromName?:    string;
    fromEmail?:   string;
    attachments?: EmailAttachment[];
    cc?:          string[];
    bcc?:         string[];
}

export interface EmailProvider {
    name: string;
    send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult>;
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

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult> {
        logger.info(`📧 [MOCK EMAIL] To: ${to}`);
        logger.info(`📧 [MOCK EMAIL] Subject: ${subject}`);
        if (options?.attachments?.length) {
            logger.info(`📧 [MOCK EMAIL] Attachments: ${options.attachments.map(a => a.filename).join(', ')}`);
        }
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

// ===== TWILIO SMS PROVIDER =====
export class TwilioSmsProvider implements SmsProvider {
    name = 'Twilio';
    constructor(
        private accountSid: string,
        private authToken: string,
        private from: string,   // Twilio sender — a number (+1...) or a Messaging Service SID (MG...)
    ) {}

    async send(to: string, message: string): Promise<SmsResult> {
        try {
            const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
            const params = new URLSearchParams({ To: toZaE164(to), Body: message });
            // A Messaging Service SID uses MessagingServiceSid; a phone number uses From.
            if (this.from.startsWith('MG')) params.set('MessagingServiceSid', this.from);
            else params.set('From', this.from);

            const response = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params.toString(),
                });
            const data = await response.json();

            if (response.ok && data.sid) {
                return { success: true, messageId: data.sid, provider: this.name };
            }
            return { success: false, error: data.message || `Twilio error ${response.status}`, provider: this.name };
        } catch (error: any) {
            return { success: false, error: error.message, provider: this.name };
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

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult> {
        try {
            const body: Record<string, any> = {
                from:    options?.fromEmail || this.fromEmail,
                to:      [to],
                subject: subject,
                html:    htmlBody,
                text:    textBody || htmlBody.replace(/<[^>]*>/g, ''),
            };

            if (options?.cc?.length) body.cc = options.cc;
            if (options?.bcc?.length) body.bcc = options.bcc;

            if (options?.attachments?.length) {
                body.attachments = options.attachments.map(a => ({
                    filename: a.filename,
                    content:  Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
                }));
            }

            const response = await fetch('https://api.resend.com/emails', {
                method:  'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type':  'application/json' },
                body: JSON.stringify(body) });

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

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult> {
        try {
            // For URL-only attachments (content is empty), fetch the file so SMTP can attach it.
            const resolvedAttachments: { filename: string; content: Buffer | string; contentType?: string }[] = [];
            for (const a of (options?.attachments ?? [])) {
                if (a.url && (!a.content || a.content === '')) {
                    try {
                        const res = await fetch(a.url);
                        if (res.ok) {
                            resolvedAttachments.push({
                                filename:    a.filename,
                                content:     Buffer.from(await res.arrayBuffer()),
                                contentType: a.contentType,
                            });
                        } else {
                            logger.warn(`[SMTP] Could not fetch attachment (${res.status}): ${a.url}`);
                        }
                    } catch (fetchErr) {
                        logger.warn(`[SMTP] Fetch error for attachment ${a.url}:`, fetchErr);
                    }
                } else {
                    resolvedAttachments.push({ filename: a.filename, content: a.content, contentType: a.contentType });
                }
            }

            // SMTP servers only allow sending from the authenticated mailbox. A caller-supplied
            // fromEmail that differs (e.g. updates@ when authenticated as notifications@) is
            // rejected with a 550. So we always send from the configured/authenticated address
            // and demote any different caller address to Reply-To — the email still delivers and
            // replies route to the intended inbox. A caller fromName is kept as the display name.
            const fromName = options?.fromName?.trim();
            const from = fromName ? `"${fromName}" <${this.fromEmail}>` : this.fromEmail;
            const replyTo = options?.fromEmail && options.fromEmail !== this.fromEmail
                ? options.fromEmail
                : undefined;

            const info = await this.transporter.sendMail({
                from:        from,
                replyTo:     replyTo,
                to:          to,
                cc:          options?.cc?.join(', '),
                bcc:         options?.bcc?.join(', '),
                subject:     subject,
                html:        htmlBody,
                text:        textBody || htmlBody.replace(/<[^>]*>/g, ''),
                attachments: resolvedAttachments.map(a => ({
                    filename:    a.filename,
                    content:     a.content,
                    contentType: a.contentType,
                })),
            });

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

// ===== TWILIO WHATSAPP PROVIDER =====
export class TwilioWhatsAppProvider implements WhatsAppProvider {
    name = 'Twilio WhatsApp';
    constructor(
        private accountSid: string,
        private authToken: string,
        private from: string,   // Twilio WhatsApp sender, e.g. +14155238886 (with or without the whatsapp: prefix)
    ) {}

    async send(to: string, message: string): Promise<WhatsAppResult> {
        try {
            const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
            const from = this.from.startsWith('whatsapp:') ? this.from : `whatsapp:${this.from}`;
            const params = new URLSearchParams({
                To: `whatsapp:${toZaE164(to)}`,
                From: from,
                Body: message,
            });

            const response = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params.toString(),
                });
            const data = await response.json();

            if (response.ok && data.sid) {
                return { success: true, messageId: data.sid, provider: this.name };
            }
            return { success: false, error: data.message || `Twilio error ${response.status}`, provider: this.name };
        } catch (error: any) {
            return { success: false, error: error.message, provider: this.name };
        }
    }
}

// ===== META WHATSAPP CLOUD API PROVIDER =====
// Direct integration with Meta's Graph API (no GHL/Twilio middleman).
// NOTE: a free-form text message only delivers inside the 24-hour customer-service window.
// Business-initiated messages (e.g. a welcome to a brand-new lead) require a pre-approved
// message template — set META_WHATSAPP_TEMPLATE to send that instead of free text.
export class MetaWhatsAppProvider implements WhatsAppProvider {
    name = 'Meta WhatsApp Cloud';
    constructor(
        private token: string,
        private phoneNumberId: string,
        private apiVersion: string = 'v21.0',
        private templateName?: string,      // optional approved template for business-initiated sends
        private templateLang: string = 'en',
    ) {}

    async send(to: string, message: string): Promise<WhatsAppResult> {
        try {
            // Meta expects the number without the leading '+'
            const recipient = toZaE164(to).replace(/^\+/, '');

            const body: Record<string, any> = this.templateName
                ? {
                    messaging_product: 'whatsapp',
                    to: recipient,
                    type: 'template',
                    template: {
                        name: this.templateName,
                        language: { code: this.templateLang },
                        components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
                    },
                  }
                : {
                    messaging_product: 'whatsapp',
                    to: recipient,
                    type: 'text',
                    text: { body: message },
                  };

            const response = await fetch(
                `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            const data = await response.json();

            if (response.ok && data.messages?.[0]?.id) {
                return { success: true, messageId: data.messages[0].id, provider: this.name };
            }
            return { success: false, error: data.error?.message || `Meta error ${response.status}`, provider: this.name };
        } catch (error: any) {
            return { success: false, error: error.message, provider: this.name };
        }
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
// ===== TELEGRAM BOT API PROVIDER =====
// Direct integration with the Telegram Bot API (free, no third party).
// `chatId` is the numeric Telegram chat id captured when the consumer starts the bot —
// Telegram cannot be addressed by phone number.
export class TelegramBotProvider implements TelegramProvider {
    name = 'Telegram';
    constructor(private botToken: string) {}

    async send(chatId: string, message: string): Promise<TelegramResult> {
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message }),
            });
            const data = await response.json();

            if (response.ok && data.ok) {
                return { success: true, messageId: String(data.result?.message_id ?? ''), provider: this.name };
            }
            return { success: false, error: data.description || `Telegram error ${response.status}`, provider: this.name };
        } catch (error: any) {
            return { success: false, error: error.message, provider: this.name };
        }
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
            // GHL v2 GET /contacts/ doesn't support direct phone/email params; use 'query' instead
            const response = await fetch(
                `${GHL_BASE_URL}/contacts/?locationId=${this.locationId}&query=${encodeURIComponent(to)}`,
                { headers: this.headers }
            );
            if (!response.ok) return null;
            const data = await response.json();
            
            // The query might return multiple contacts (fuzzy match), so we find the exact one
            if (!data.contacts || data.contacts.length === 0) return null;
            
            const exactMatch = data.contacts.find((c: any) => 
                type === 'phone' ? c.phone === to : c.email === to
            );
            
            return exactMatch?.id ?? data.contacts[0].id;
        } catch (error) {
            logger.error('[GHL] Contact lookup error:', error);
            return null;
        }
    }

    protected async createContact(
        value: string,
        type: 'phone' | 'email',
        details?: { firstName?: string; lastName?: string; idNumber?: string },
    ): Promise<string | null> {
        try {
            const body: Record<string, unknown> = { locationId: this.locationId };
            if (type === 'phone') body.phone = value;
            else body.email = value;
            if (details?.firstName) body.firstName = details.firstName;
            if (details?.lastName)  body.lastName  = details.lastName;
            if (details?.idNumber)  body.customField = [{ id: 'idNumber', value: details.idNumber }];

            const response = await fetch(`${GHL_BASE_URL}/contacts/`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                // If contact already exists, GHL returns 400 with the existing contactId in meta
                if (response.status === 400 && data.message?.includes('duplicated') && data.meta?.contactId) {
                    logger.info(`[GHL] Duplicate contact found for ${value}, using existing ID: ${data.meta.contactId}`);
                    return data.meta.contactId;
                }
                logger.error('[GHL] Create contact error:', data);
                return null;
            }
            
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
        attachments?: string[],
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            const body: Record<string, any> = { type, contactId, message };
            if (type === 'Email' && subject) body.subject = subject;
            if (type === 'Email' && attachments?.length) body.attachments = attachments;

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

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult> {
        const contactId = await this.ensureContactId(to, 'email');
        if (!contactId) return { success: false, error: 'Contact could not be found or created', provider: this.name };
        
        // GHL Email API expects attachment URLs — use the explicit url field, falling back to content if it's a URL string.
        const attachmentUrls = options?.attachments
            ?.map(a => a.url ?? (typeof a.content === 'string' && (a.content.startsWith('http') || a.content.startsWith('/')) ? a.content : null))
            .filter((u): u is string => u !== null);

        const res = await this.sendMessage(contactId, htmlBody, 'Email', subject, attachmentUrls);
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

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult> {
        try {
            const attachmentUrls = options?.attachments
                ?.map(a => a.url ?? (typeof a.content === 'string' && a.content.startsWith('http') ? a.content : null))
                .filter((u): u is string => u !== null);

            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'EMAIL',
                    email: to,
                    subject: subject,
                    message: htmlBody,
                    from_name: options?.fromName,
                    from_email: options?.fromEmail,
                    cc: options?.cc?.length ? options.cc : undefined,
                    bcc: options?.bcc?.length ? options.bcc : undefined,
                    attachments: attachmentUrls?.length ? attachmentUrls : undefined,
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

// ===== FALLBACK EMAIL PROVIDER =====
// Tries the primary provider; if it returns success:false, retries with the fallback.
// Used to wrap GHL (primary) with SMTP (fallback) so professional emails to DCs/bureaus
// still deliver even when GHL can't find or create a contact.
export class FallbackEmailProvider implements EmailProvider {
    name: string;

    constructor(private primary: EmailProvider, private fallback: EmailProvider) {
        this.name = `${primary.name}→${fallback.name}`;
    }

    async send(to: string, subject: string, htmlBody: string, textBody?: string, options?: EmailOptions): Promise<EmailResult> {
        const result = await this.primary.send(to, subject, htmlBody, textBody, options);
        if (result.success) return result;

        logger.warn(`[Email] ${this.primary.name} failed for ${to} — retrying via ${this.fallback.name}. Error: ${result.error}`);
        const fallbackResult = await this.fallback.send(to, subject, htmlBody, textBody, options);
        return { ...fallbackResult, provider: this.name };
    }
}
