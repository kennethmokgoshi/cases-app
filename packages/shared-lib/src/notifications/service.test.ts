import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock all external dependencies ──────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({
    prisma: {
        notificationLog: {
            create: vi.fn().mockResolvedValue({}),
        },
        systemSettings: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        user: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
        },
    },
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../integrations', () => ({
    getGHLCredentials: vi.fn().mockResolvedValue({ apiKey: null, locationId: null }),
    getSMTPCredentials: vi.fn().mockResolvedValue({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '' }),
    isGhlEnabled: vi.fn(() => process.env.GHL_ENABLED !== 'false'),
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

import { sendInternalNotification, sendManualMessage, sendStatusChangeNotification } from './service';
import type { NotificationPayload } from './service';

// ─── sendStatusChangeNotification: NEW_LEAD template selection ────────────────

describe('sendStatusChangeNotification — NEW_LEAD template selection', () => {
    let sentEmails: Array<{ to: string; subject: string; html?: string; text?: string; options?: any }>;

    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.GHL_EMAIL_WEBHOOK_URL;
        delete process.env.GHL_WEBHOOK_URL;
        delete process.env.SMTP_HOST;
        delete process.env.RESEND_API_KEY;

        // Capture every email that the MockEmailProvider is asked to send
        sentEmails = [];
        const { MockEmailProvider } = await import('./providers');
        (MockEmailProvider as any).mockImplementation(() => ({
            name: 'mock',
            send: vi.fn().mockImplementation((to: string, subject: string, html?: string, text?: string, options?: any) => {
                sentEmails.push({ to, subject, html, text, options });
                return Promise.resolve({ success: true, messageId: 'mock-001', provider: 'mock' });
            }),
        }));
    });

    const basePayload = (overrides: Partial<NotificationPayload>): NotificationPayload => ({
        caseId: 'case-001',
        clientName: 'Thabo Mokoena',
        clientEmail: 'thabo@example.com',
        fileNumber: 'ZDM-2026-001-ABC',
        statusCode: 'NEW_LEAD',
        partnerName: 'Letsatsi',
        isB2B: true,
        ...overrides,
    });

    it('uses the B2B "Head Office" welcome when a partner user created the case', async () => {
        await sendStatusChangeNotification(basePayload({ isB2B: true, isCreatedByPartner: true }));
        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].subject).toContain('Letsatsi');
    });

    it('uses the B2B "Head Office" welcome even when staff captured the B2B lead', async () => {
        // Regression guard: previously this path used the Zenowethu-branded NEW_LEAD_STAFF email
        await sendStatusChangeNotification(basePayload({ isB2B: true, isCreatedByPartner: false }));
        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].subject).toContain('Letsatsi');
    });

    it('uses the Zenowethu-branded welcome for direct B2C intake', async () => {
        await sendStatusChangeNotification(basePayload({ isB2B: false, isCreatedByPartner: false }));
        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].subject).not.toContain('Letsatsi');
    });

    it('sends DC file request to the DC, copies the consumer, and BCCs notifications', async () => {
        const result = await sendStatusChangeNotification({
            caseId: 'case-002',
            clientName: 'Thabo Mokoena',
            clientEmail: 'thabo@example.com',
            fileNumber: 'ZDM-2026-002-ABC',
            statusCode: 'REQUEST_FILE_DC',
            dcName: 'Example Debt Counsellor',
            dcEmail: 'preferred-dc@example.com',
            dcCcEmails: ['thabo@example.com'],
            idNumber: '8001015009087',
            isB2B: false,
        });

        expect(result.emailSuccess).toBe(true);
        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].to).toBe('preferred-dc@example.com');
        expect(sentEmails[0].options?.cc).toEqual(['thabo@example.com']);
        expect(sentEmails[0].options?.bcc).toContain('notifications@zenowethu.co.za');
    });

    it('includes the direct project link in missing-manager admin alerts', async () => {
        const { prisma } = await import('@zenowethu/database');
        vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
            { email: 'admin@zenowethu.co.za', role: 'ADMIN', phone: null },
        ] as never);

        await sendInternalNotification({
            role: 'ADMIN',
            statusCode: 'NO_MANAGER_ADMIN',
            variables: {
                projectName: 'May',
                projectUrl: 'https://cases.test/projects?id=proj-may',
            },
        });

        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].to).toBe('admin@zenowethu.co.za');
        expect(sentEmails[0].subject).toBe('URGENT: No Manager Assigned to Project May');
        expect(sentEmails[0].text).toContain('Project Link: https://cases.test/projects?id=proj-may');
    });
});

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

// ─── getEmailProvider: EMAIL_PROVIDER override ──────────────────────────────────
// GHL is not yet set up, so EMAIL_PROVIDER=smtp must force the direct SMTP path even
// when GHL credentials are present — otherwise every email makes a failing GHL call first.

describe('email provider selection — EMAIL_PROVIDER override', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.GHL_EMAIL_WEBHOOK_URL;
        delete process.env.RESEND_API_KEY;

        const { getGHLCredentials, getSMTPCredentials } = await import('../integrations');
        // Both GHL and SMTP fully configured — selection must come down to EMAIL_PROVIDER.
        vi.mocked(getGHLCredentials).mockResolvedValue({ apiKey: 'ghl-key', locationId: 'loc-1' } as any);
        vi.mocked(getSMTPCredentials).mockResolvedValue({
            host: 'mail.zenowethu.co.za', port: 587, secure: false,
            username: 'notifications@zenowethu.co.za', password: 'secret',
            fromEmail: 'notifications@zenowethu.co.za',
        } as any);
    });

    afterEach(() => {
        delete process.env.EMAIL_PROVIDER;
    });

    it('uses SMTP (not GHL) when EMAIL_PROVIDER=smtp even though GHL is configured', async () => {
        process.env.EMAIL_PROVIDER = 'smtp';
        const { SmtpEmailProvider, GhlEmailProvider } = await import('./providers');

        const result = await sendManualMessage('case-001', 'EMAIL', 'user@test.com', 'Body', 'Subject');

        expect(result.emailSuccess).toBe(true);
        expect(SmtpEmailProvider).toHaveBeenCalled();
        expect(GhlEmailProvider).not.toHaveBeenCalled();
    });

    it('falls back to GHL-first auto-detect when EMAIL_PROVIDER is unset', async () => {
        const { GhlEmailProvider } = await import('./providers');

        await sendManualMessage('case-001', 'EMAIL', 'user@test.com', 'Body', 'Subject');

        expect(GhlEmailProvider).toHaveBeenCalled();
    });
});

// ─── GHL_ENABLED=false suspends GHL across the notification service ──────────────

describe('GHL suspension — GHL_ENABLED=false', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.EMAIL_PROVIDER;
        process.env.GHL_ENABLED = 'false';
        // GHL webhook still "configured" in env, yet must not be used when suspended.
        process.env.GHL_EMAIL_WEBHOOK_URL = 'https://hooks.example.com/email';
        const { getGHLCredentials, getSMTPCredentials } = await import('../integrations');
        // The real resolver returns empty creds when suspended — mirror that here.
        vi.mocked(getGHLCredentials).mockResolvedValue({ apiKey: '', locationId: '' } as any);
        vi.mocked(getSMTPCredentials).mockResolvedValue({
            host: 'mail.zenowethu.co.za', port: 587, secure: false,
            username: 'notifications@zenowethu.co.za', password: 'secret',
            fromEmail: 'notifications@zenowethu.co.za',
        } as any);
    });

    afterEach(() => {
        delete process.env.GHL_ENABLED;
        delete process.env.GHL_EMAIL_WEBHOOK_URL;
    });

    it('does not use GHL API or GHL webhook for email — uses SMTP instead', async () => {
        const { SmtpEmailProvider, GhlEmailProvider, GhlWebhookEmailProvider } = await import('./providers');

        const result = await sendManualMessage('case-001', 'EMAIL', 'user@test.com', 'Body', 'Subject');

        expect(result.emailSuccess).toBe(true);
        expect(SmtpEmailProvider).toHaveBeenCalled();
        expect(GhlEmailProvider).not.toHaveBeenCalled();
        expect(GhlWebhookEmailProvider).not.toHaveBeenCalled();
    });
});
