import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findMany: vi.fn().mockResolvedValue([
                {
                    id: 'case-1',
                    fileNumber: 'ZENO-001',
                    status: 'INVOICE_REQUESTED_DC',
                    client: {
                        firstName: 'John',
                        lastName: 'Doe',
                        idNumber: '8501015000088',
                    },
                },
            ]),
        },
        mailboxAccount: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        user: {
            findFirst: vi.fn().mockResolvedValue({ id: 'user-admin' }),
        },
        automationRun: {
            create: vi.fn().mockResolvedValue({ id: 'auto-run-1' }),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } }),
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
    getSMTPCredentials: vi.fn().mockResolvedValue({ username: 'smtp@zeno.co.za', password: 'pass' }),
}));

vi.mock('@/lib/mailbox-smtp', () => ({
    getSmtpUsernameIfConfigured: vi.fn().mockResolvedValue(null),
}));

describe('POST /api/cron/invoice-email-scan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects unauthenticated requests without cron secret or admin session', async () => {
        const { auth } = await import('@zenowethu/shared-lib');
        (auth as any).mockResolvedValueOnce(null);

        const req = new Request('https://cases.zenowethu.co.za/api/cron/invoice-email-scan', {
            method: 'POST',
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
    });

    it('handles dryRun mode successfully', async () => {
        const req = new Request('https://cases.zenowethu.co.za/api/cron/invoice-email-scan?dryRun=true', {
            method: 'POST',
            headers: {
                'x-cron-secret': process.env.CRON_SECRET || 'test-secret',
            },
        });
        process.env.CRON_SECRET = 'test-secret';

        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.dryRun).toBe(true);
        expect(data.casesFound).toBe(1);
    });
});
