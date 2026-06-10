import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock all external dependencies ──────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationLog: {
            create: vi.fn().mockResolvedValue({}),
        },
        systemSettings: {
            findMany: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../integrations', () => ({
    getGHLCredentials: vi.fn().mockResolvedValue({ apiKey: null, locationId: null }),
    getSMTPCredentials: vi.fn().mockResolvedValue({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '' }),
}));

// Mock the providers module to control email sending
vi.mock('./providers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./providers')>();
    return {
        ...actual,
        SmtpEmailProvider: vi.fn().mockImplementation(() => ({
            name: 'smtp',
            send: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-123', provider: 'smtp' }),
        })),
        MockEmailProvider: vi.fn().mockImplementation(() => ({
            name: 'mock',
            send: vi.fn().mockResolvedValue({ success: true, messageId: 'mock-001', provider: 'mock' }),
        })),
        MockSmsProvider: vi.fn().mockImplementation(() => ({
            name: 'mock-sms',
            send: vi.fn().mockResolvedValue({ success: true, provider: 'mock-sms' }),
        })),
        MockWhatsAppProvider: vi.fn().mockImplementation(() => ({
            name: 'mock-wa',
            send: vi.fn().mockResolvedValue({ success: true, provider: 'mock-wa' }),
        })),
        MockTelegramProvider: vi.fn().mockImplementation(() => ({
            name: 'mock-tg',
            send: vi.fn().mockResolvedValue({ success: true, provider: 'mock-tg' }),
        })),
        GhlWebhookSmsProvider: vi.fn(),
        GhlWebhookEmailProvider: vi.fn(),
        GhlWebhookWhatsAppProvider: vi.fn(),
        GhlSmsProvider: vi.fn(),
        GhlEmailProvider: vi.fn(),
        GhlWhatsAppProvider: vi.fn(),
        ClickatellSmsProvider: vi.fn(),
        ResendEmailProvider: vi.fn(),
    };
});

import { sendManualMessage } from './service';

// ─── sendManualMessage ────────────────────────────────────────────────────────

describe('sendManualMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Ensure no GHL webhooks are set so MockEmailProvider is used
        delete process.env.GHL_EMAIL_WEBHOOK_URL;
        delete process.env.GHL_WEBHOOK_URL;
        delete process.env.SMTP_HOST;
        delete process.env.RESEND_API_KEY;
    });

    it('returns emailSuccess=true when EMAIL channel succeeds', async () => {
        const result = await sendManualMessage(
            'case-001',
            'EMAIL',
            'staff@zenowethu.co.za',
            'You were mentioned in case ZW-0042.',
            'You were mentioned in case ZW-0042'
        );
        expect(result.emailSuccess).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('sets emailMessageId on successful EMAIL send', async () => {
        const result = await sendManualMessage(
            'case-001',
            'EMAIL',
            'staff@zenowethu.co.za',
            'Mention notification body.',
            'Mention notification subject'
        );
        expect(result.emailMessageId).toBeDefined();
    });

    it('returns smsSuccess=false when channel is EMAIL (not SMS)', async () => {
        const result = await sendManualMessage(
            'case-001',
            'EMAIL',
            'staff@zenowethu.co.za',
            'Body',
            'Subject'
        );
        expect(result.smsSuccess).toBe(false);
        expect(result.whatsappSuccess).toBe(false);
    });

    it('returns smsSuccess=true when SMS channel succeeds', async () => {
        const result = await sendManualMessage(
            'case-001',
            'SMS',
            '+27821234567',
            'You were mentioned in case ZW-0042.'
        );
        expect(result.smsSuccess).toBe(true);
        expect(result.emailSuccess).toBe(false);
        expect(result.errors).toHaveLength(0);
    });

    it('returns whatsappSuccess=true when WHATSAPP channel succeeds', async () => {
        const result = await sendManualMessage(
            'case-001',
            'WHATSAPP',
            '+27821234567',
            'You were mentioned in case ZW-0042.'
        );
        expect(result.whatsappSuccess).toBe(true);
        expect(result.emailSuccess).toBe(false);
        expect(result.errors).toHaveLength(0);
    });

    it('logs the notification to the database after sending', async () => {
        const { prisma } = await import('@zenowethu/database');
        await sendManualMessage(
            'case-abc',
            'EMAIL',
            'user@test.com',
            'Body text.',
            'Subject line'
        );
        expect(prisma.notificationLog.create).toHaveBeenCalledOnce();
        const callArg = (prisma.notificationLog.create as any).mock.calls[0][0];
        expect(callArg.data.caseId).toBe('case-abc');
        expect(callArg.data.channel).toBe('EMAIL');
        expect(callArg.data.recipient).toBe('user@test.com');
    });

    it('returns error in errors array when provider throws', async () => {
        const { MockEmailProvider } = await import('./providers');
        (MockEmailProvider as any).mockImplementationOnce(() => ({
            name: 'mock',
            send: vi.fn().mockRejectedValue(new Error('SMTP connection refused')),
        }));

        const result = await sendManualMessage(
            'case-001',
            'EMAIL',
            'user@test.com',
            'Body',
            'Subject'
        );
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
