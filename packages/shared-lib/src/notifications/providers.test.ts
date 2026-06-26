import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EmailProvider, EmailResult, EmailOptions } from './providers';

// Mock nodemailer so SmtpEmailProvider tests capture sendMail args without a real connection.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock('nodemailer', () => ({
    default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

import {
    FallbackEmailProvider,
    SmtpEmailProvider,
    TwilioSmsProvider,
    TwilioWhatsAppProvider,
    MetaWhatsAppProvider,
    TelegramBotProvider,
    toZaE164,
} from './providers';

// Helper: stub global fetch with a single JSON response
function stubFetch(ok: boolean, json: any, status = ok ? 200 : 400) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(json),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function mockEmailProvider(result: EmailResult): EmailProvider {
    return {
        name: result.provider,
        send: vi.fn().mockResolvedValue(result),
    };
}

describe('FallbackEmailProvider', () => {
    it('returns primary result when primary succeeds', async () => {
        const primary  = mockEmailProvider({ success: true, messageId: 'msg-1', provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true, messageId: 'msg-2', provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const result = await provider.send('test@example.com', 'Subject', '<p>Hi</p>');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('msg-1');
        expect(primary.send).toHaveBeenCalledOnce();
        expect(fallback.send).not.toHaveBeenCalled();
    });

    it('falls back to secondary when primary fails', async () => {
        const primary  = mockEmailProvider({ success: false, error: 'Contact not found', provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true,  messageId: 'smtp-42',       provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const result = await provider.send('dc@lawfirm.co.za', 'Subject', '<p>Hi</p>');

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('smtp-42');
        expect(primary.send).toHaveBeenCalledOnce();
        expect(fallback.send).toHaveBeenCalledOnce();
    });

    it('returns fallback failure when both fail', async () => {
        const primary  = mockEmailProvider({ success: false, error: 'GHL error',  provider: 'GHL' });
        const fallback = mockEmailProvider({ success: false, error: 'SMTP error', provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const result = await provider.send('nobody@example.com', 'Subject', '<p>Hi</p>');

        expect(result.success).toBe(false);
        expect(result.error).toBe('SMTP error');
    });

    it('passes all arguments to primary provider', async () => {
        const primary  = mockEmailProvider({ success: true, provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true, provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const options: EmailOptions = { cc: ['cc@example.com'] };
        await provider.send('to@example.com', 'Subj', '<b>html</b>', 'text', options);

        expect(primary.send).toHaveBeenCalledWith('to@example.com', 'Subj', '<b>html</b>', 'text', options);
    });

    it('names itself as primary→fallback', () => {
        const primary  = mockEmailProvider({ success: true, provider: 'GoHighLevel' });
        const fallback = mockEmailProvider({ success: true, provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);
        expect(provider.name).toBe('GoHighLevel→SMTP');
    });

    it('passes BCC through to primary provider', async () => {
        const primary  = mockEmailProvider({ success: true, provider: 'GHL' });
        const fallback = mockEmailProvider({ success: true, provider: 'SMTP' });
        const provider = new FallbackEmailProvider(primary, fallback);

        const options: EmailOptions = { bcc: ['audit@example.com'] };
        await provider.send('to@example.com', 'Subj', '<b>html</b>', 'text', options);

        expect(primary.send).toHaveBeenCalledWith('to@example.com', 'Subj', '<b>html</b>', 'text', options);
        expect(options.bcc).toEqual(['audit@example.com']);
    });
});

describe('toZaE164', () => {
    it('converts a local 0-prefixed SA number', () => {
        expect(toZaE164('0821234567')).toBe('+27821234567');
    });
    it('prefixes a 27-prefixed number with +', () => {
        expect(toZaE164('27821234567')).toBe('+27821234567');
    });
    it('leaves an already-international number unchanged and strips spaces', () => {
        expect(toZaE164('+27 82 123 4567')).toBe('+27821234567');
    });
});

describe('Messaging providers (fetch mocked)', () => {
    beforeEach(() => vi.unstubAllGlobals());
    afterEach(() => vi.unstubAllGlobals());

    describe('TwilioSmsProvider', () => {
        it('returns success and messageId on a Twilio sid response', async () => {
            const fetchMock = stubFetch(true, { sid: 'SM123' });
            const provider = new TwilioSmsProvider('AC1', 'token', '+27110000000');
            const res = await provider.send('0821234567', 'Hello');

            expect(res.success).toBe(true);
            expect(res.messageId).toBe('SM123');
            const body = (fetchMock.mock.calls[0][1] as any).body as string;
            expect(body).toContain('To=%2B27821234567'); // E.164 + url-encoded '+'
            expect(body).toContain('From=%2B27110000000');
        });

        it('uses MessagingServiceSid when the sender is an MG SID', async () => {
            const fetchMock = stubFetch(true, { sid: 'SM999' });
            const provider = new TwilioSmsProvider('AC1', 'token', 'MGabc');
            await provider.send('0821234567', 'Hi');
            const body = (fetchMock.mock.calls[0][1] as any).body as string;
            expect(body).toContain('MessagingServiceSid=MGabc');
            expect(body).not.toContain('From=');
        });

        it('returns failure with the Twilio error message', async () => {
            stubFetch(false, { message: 'not a valid phone number' }, 400);
            const provider = new TwilioSmsProvider('AC1', 'token', '+27110000000');
            const res = await provider.send('bad', 'Hello');
            expect(res.success).toBe(false);
            expect(res.error).toBe('not a valid phone number');
        });
    });

    describe('TwilioWhatsAppProvider', () => {
        it('prefixes both To and From with whatsapp:', async () => {
            const fetchMock = stubFetch(true, { sid: 'WA1' });
            const provider = new TwilioWhatsAppProvider('AC1', 'token', '+14155238886');
            const res = await provider.send('0821234567', 'Hi');

            expect(res.success).toBe(true);
            const body = (fetchMock.mock.calls[0][1] as any).body as string;
            expect(body).toContain('To=whatsapp%3A%2B27821234567');
            expect(body).toContain('From=whatsapp%3A%2B14155238886');
        });
    });

    describe('MetaWhatsAppProvider', () => {
        it('sends a text message and parses the returned message id', async () => {
            const fetchMock = stubFetch(true, { messages: [{ id: 'wamid.X' }] });
            const provider = new MetaWhatsAppProvider('tok', '123456');
            const res = await provider.send('0821234567', 'Hi');

            expect(res.success).toBe(true);
            expect(res.messageId).toBe('wamid.X');
            const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
            expect(body.type).toBe('text');
            expect(body.to).toBe('27821234567'); // no leading +
            expect(body.text.body).toBe('Hi');
        });

        it('sends a template message when a template name is configured', async () => {
            const fetchMock = stubFetch(true, { messages: [{ id: 'wamid.Y' }] });
            const provider = new MetaWhatsAppProvider('tok', '123456', 'v21.0', 'welcome_lead', 'en');
            await provider.send('0821234567', 'ZDM-2026-001');
            const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
            expect(body.type).toBe('template');
            expect(body.template.name).toBe('welcome_lead');
        });

        it('returns the Meta error message on failure', async () => {
            stubFetch(false, { error: { message: 'Template not found' } }, 400);
            const provider = new MetaWhatsAppProvider('tok', '123456');
            const res = await provider.send('0821234567', 'Hi');
            expect(res.success).toBe(false);
            expect(res.error).toBe('Template not found');
        });
    });

    describe('TelegramBotProvider', () => {
        it('posts to the bot sendMessage endpoint and parses message_id', async () => {
            const fetchMock = stubFetch(true, { ok: true, result: { message_id: 42 } });
            const provider = new TelegramBotProvider('botToken');
            const res = await provider.send('99001122', 'Hello');

            expect(res.success).toBe(true);
            expect(res.messageId).toBe('42');
            expect(fetchMock.mock.calls[0][0]).toContain('/botbotToken/sendMessage');
            const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
            expect(body.chat_id).toBe('99001122');
            expect(body.text).toBe('Hello');
        });

        it('returns failure with the Telegram description', async () => {
            stubFetch(false, { ok: false, description: 'chat not found' }, 400);
            const provider = new TelegramBotProvider('botToken');
            const res = await provider.send('00000', 'Hi');
            expect(res.success).toBe(false);
            expect(res.error).toBe('chat not found');
        });
    });
});

describe('SmtpEmailProvider — sender handling', () => {
    const config = {
        host: 'mail.zenowethu.co.za', port: 587, secure: false,
        auth: { user: 'notifications@zenowethu.co.za', pass: 'secret' },
        fromEmail: 'notifications@zenowethu.co.za',
    };

    beforeEach(() => {
        sendMailMock.mockReset();
        sendMailMock.mockResolvedValue({ messageId: 'smtp-1' });
    });

    it('always sends from the authenticated mailbox and demotes a different caller fromEmail to Reply-To', async () => {
        // Regression: caller-supplied updates@ used to become the From and was 550-rejected.
        const provider = new SmtpEmailProvider(config);
        const res = await provider.send('client@example.com', 'Subj', '<p>Hi</p>', 'Hi', {
            fromEmail: 'updates@zenowethu.co.za',
            fromName: 'Zenowethu Debt Management',
        });

        expect(res.success).toBe(true);
        const arg = sendMailMock.mock.calls[0][0];
        expect(arg.from).toBe('"Zenowethu Debt Management" <notifications@zenowethu.co.za>');
        expect(arg.replyTo).toBe('updates@zenowethu.co.za');
    });

    it('sets no Reply-To when the caller fromEmail matches the authenticated mailbox', async () => {
        const provider = new SmtpEmailProvider(config);
        await provider.send('client@example.com', 'Subj', '<p>Hi</p>', 'Hi', {
            fromEmail: 'notifications@zenowethu.co.za',
        });

        const arg = sendMailMock.mock.calls[0][0];
        expect(arg.from).toBe('notifications@zenowethu.co.za');
        expect(arg.replyTo).toBeUndefined();
    });

    it('returns a failure result with the SMTP error message when sendMail throws', async () => {
        sendMailMock.mockRejectedValueOnce(new Error('550 can not send'));
        const provider = new SmtpEmailProvider(config);
        const res = await provider.send('client@example.com', 'Subj', '<p>Hi</p>');

        expect(res.success).toBe(false);
        expect(res.error).toContain('550 can not send');
    });
});
