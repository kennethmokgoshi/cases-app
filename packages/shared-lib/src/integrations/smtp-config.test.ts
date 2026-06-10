import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted stubs ────────────────────────────────────────────────────────────

const mockFindMany = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({
    prisma: {
        systemSettings: { findMany: mockFindMany },
    },
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { getSMTPCredentials, invalidateSMTPCredentialsCache } from './smtp-config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbSettings() {
    return [
        { key: 'smtp_host', value: 'db.mail.example.com' },
        { key: 'smtp_port', value: '465' },
        { key: 'smtp_secure', value: 'true' },
        { key: 'smtp_user', value: 'db-user@example.com' },
        { key: 'smtp_password', value: 'db-password' },
        { key: 'smtp_from', value: 'db-from@example.com' },
    ];
}

function clearEnv() {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.EMAIL_FROM;
}

// ─── getSMTPCredentials ───────────────────────────────────────────────────────

describe('getSMTPCredentials', () => {
    beforeEach(() => {
        invalidateSMTPCredentialsCache();
        vi.clearAllMocks();
        clearEnv();
    });

    it('returns credentials loaded from DB settings', async () => {
        mockFindMany.mockResolvedValue(dbSettings());

        const creds = await getSMTPCredentials();

        expect(creds.host).toBe('db.mail.example.com');
        expect(creds.port).toBe(465);
        expect(creds.secure).toBe(true);
        expect(creds.username).toBe('db-user@example.com');
        expect(creds.password).toBe('db-password');
        expect(creds.fromEmail).toBe('db-from@example.com');
    });

    it('falls back to env vars when DB returns empty settings', async () => {
        mockFindMany.mockResolvedValue([]);
        process.env.SMTP_HOST = 'env.mail.example.com';
        process.env.SMTP_USER = 'env-user@example.com';
        process.env.SMTP_PASSWORD = 'env-password';

        const creds = await getSMTPCredentials();

        expect(creds.host).toBe('env.mail.example.com');
        expect(creds.port).toBe(587);
        expect(creds.secure).toBe(false);
        expect(creds.username).toBe('env-user@example.com');
        expect(creds.password).toBe('env-password');
        // fromEmail falls back to the SMTP user when not set
        expect(creds.fromEmail).toBe('env-user@example.com');
    });

    it('falls back to env vars when DB throws', async () => {
        mockFindMany.mockRejectedValue(new Error('DB connection failed'));
        process.env.SMTP_HOST = 'env-fallback.example.com';
        process.env.SMTP_USER = 'fallback@example.com';
        process.env.SMTP_PASS = 'legacy-pass-var';

        const creds = await getSMTPCredentials();

        expect(creds.host).toBe('env-fallback.example.com');
        expect(creds.password).toBe('legacy-pass-var');
    });

    it('DB setting takes priority over env var for the same key', async () => {
        process.env.SMTP_HOST = 'env.example.com';
        mockFindMany.mockResolvedValue(dbSettings());

        const creds = await getSMTPCredentials();

        expect(creds.host).toBe('db.mail.example.com');
    });

    it('caches credentials within the TTL window', async () => {
        mockFindMany.mockResolvedValue(dbSettings());

        await getSMTPCredentials();
        await getSMTPCredentials();
        await getSMTPCredentials();

        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});

// ─── invalidateSMTPCredentialsCache ──────────────────────────────────────────

describe('invalidateSMTPCredentialsCache', () => {
    beforeEach(() => {
        invalidateSMTPCredentialsCache();
        vi.clearAllMocks();
        clearEnv();
    });

    it('forces a fresh DB fetch on the next call after invalidation', async () => {
        mockFindMany
            .mockResolvedValueOnce([{ key: 'smtp_host', value: 'first.example.com' }])
            .mockResolvedValueOnce([{ key: 'smtp_host', value: 'second.example.com' }]);

        const first = await getSMTPCredentials();
        expect(first.host).toBe('first.example.com');

        const cached = await getSMTPCredentials();
        expect(cached.host).toBe('first.example.com');
        expect(mockFindMany).toHaveBeenCalledTimes(1);

        invalidateSMTPCredentialsCache();
        const fresh = await getSMTPCredentials();
        expect(fresh.host).toBe('second.example.com');
        expect(mockFindMany).toHaveBeenCalledTimes(2);
    });
});
