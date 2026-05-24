import nodemailer from 'nodemailer';

export interface EmailAttachment {
    filename: string;
    content:  Buffer;
    contentType: string;
}

export interface SendEmailOptions {
    to:          string | string[];
    subject:     string;
    html:        string;
    text?:       string;
    attachments?: EmailAttachment[];
    fromName?:    string;
    fromEmail?:   string;
}

export interface SendEmailResult {
    success:   boolean;
    messageId?: string;
    error?:    string;
}

/**
 * Send email with optional PDF attachments.
 * Provider priority (mirrors the shared notification service):
 *   1. SMTP  — when SMTP_HOST is set
 *   2. Resend — when RESEND_API_KEY is set (supports attachments via base64)
 *   3. Mock  — dev/test only; logs to console and returns success
 */
export async function sendEmailWithAttachments(opts: SendEmailOptions): Promise<SendEmailResult> {
    // --- 1. SMTP ---
    if (process.env.SMTP_HOST) {
        const transporter = nodemailer.createTransport({
            host:   process.env.SMTP_HOST,
            port:   parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
            },
            tls: { rejectUnauthorized: false },
        });

        try {
            const configuredFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER;
            const senderAddress  = opts.fromEmail || configuredFrom;
            const fromHeader     = opts.fromName
                ? `"${opts.fromName}" <${configuredFrom}>`
                : senderAddress;

            const info = await transporter.sendMail({
                from:        fromHeader,
                to:          Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
                subject:     opts.subject,
                html:        opts.html,
                text:        opts.text ?? opts.html.replace(/<[^>]*>/g, ''),
                attachments: opts.attachments?.map(a => ({
                    filename:    a.filename,
                    content:     a.content,
                    contentType: a.contentType,
                })),
            });
            return { success: true, messageId: info.messageId };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    // --- 2. Resend (supports base64 attachments) ---
    if (process.env.RESEND_API_KEY) {
        const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'notifications@zenowethu.co.za';
        const toAddresses = Array.isArray(opts.to) ? opts.to : [opts.to];

        const body: Record<string, unknown> = {
            from:    opts.fromEmail || fromAddress,
            to:      toAddresses,
            subject: opts.subject,
            html:    opts.html,
            text:    opts.text ?? opts.html.replace(/<[^>]*>/g, ''),
        };

        if (opts.attachments?.length) {
            body.attachments = opts.attachments.map(a => ({
                filename: a.filename,
                content:  a.content.toString('base64'),
            }));
        }

        try {
            const response = await fetch('https://api.resend.com/emails', {
                method:  'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json() as { id?: string; message?: string };

            if (response.ok && data.id) {
                return { success: true, messageId: data.id };
            }
            return { success: false, error: data.message || `Resend HTTP ${response.status}` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    // --- 3. GHL Webhook Fallback ---
    if (process.env.GHL_EMAIL_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL) {
        const webhookUrl = process.env.GHL_EMAIL_WEBHOOK_URL || process.env.GHL_WEBHOOK_URL;
        try {
            await fetch(webhookUrl!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email:   Array.isArray(opts.to) ? opts.to[0] : opts.to,
                    subject: opts.subject,
                    message: opts.text || opts.html.replace(/<[^>]*>/g, ''),
                    html:    opts.html,
                    from_name:  opts.fromName,
                    from_email: opts.fromEmail,
                    first_name: opts.fromName ? opts.fromName.split(' ')[0] : '',
                    last_name:  opts.fromName ? opts.fromName.split(' ').slice(1).join(' ') : '',
                    pre_header: opts.text ? opts.text.substring(0, 100) : opts.subject,
                    hasAttachments: !!opts.attachments?.length,
                    attachmentCount: opts.attachments?.length || 0
                }),
            });
            return { success: true, messageId: `ghl-${Date.now()}` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: `GHL Fallback Error: ${message}` };
        }
    }

    // --- 4. Mock fallback (dev/test only) ---
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    
    if (!isDev) {
        console.warn('⚠️ [EMAIL] No email provider (SMTP, Resend, or GHL) configured on non-dev server!');
        return { 
            success: false, 
            error: 'Email provider not configured. Please set SMTP_HOST, RESEND_API_KEY, or GHL_EMAIL_WEBHOOK_URL.' 
        };
    }

    console.info('[MOCK EMAIL]', { to: opts.to, subject: opts.subject });
    return { success: true, messageId: `mock-${Date.now()}` };
}
