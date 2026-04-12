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
}

export interface SendEmailResult {
    success:   boolean;
    messageId?: string;
    error?:    string;
}

/**
 * Send email with optional PDF attachments via SMTP (env vars).
 * Falls back to a mock log when SMTP_HOST is not configured (dev/test).
 */
export async function sendEmailWithAttachments(opts: SendEmailOptions): Promise<SendEmailResult> {
    if (!process.env.SMTP_HOST) {
        // Dev/test fallback — log and succeed silently
        console.info('[MOCK EMAIL]', { to: opts.to, subject: opts.subject });
        return { success: true, messageId: `mock-${Date.now()}` };
    }

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
        const info = await transporter.sendMail({
            from:        process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
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
