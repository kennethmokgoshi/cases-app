import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    invalidateSMTPCredentialsCache: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        systemSettings: {
            findMany: vi.fn(),
            upsert: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/schemas', () => ({
    parseBody: vi.fn((schema: any, data: any) => {
        const result = schema.safeParse(data);
        if (result.success) return { success: true, data: result.data };
        return {
            success: false,
            response: Response.json({ error: 'Validation failed' }, { status: 422 }),
        };
    }),
}));

import { auth, invalidateSMTPCredentialsCache } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST, DELETE } from './route';

// ── Session fixtures ───────────────────────────────────────────────────────

const adminSession     = { user: { id: 'u1', isAdmin: true,  isExecutive: false } };
const executiveSession = { user: { id: 'u2', isAdmin: false, isExecutive: true  } };
const memberSession    = { user: { id: 'u3', isAdmin: false, isExecutive: false } };
const noSession        = null;

const validBody = {
    host: 'mail.zenowethu.co.za',
    port: 587,
    secure: false,
    username: 'transfer@zenowethu.co.za',
    password: 'NewSecret123',
    fromEmail: 'notifications@zenowethu.co.za',
};

function makeReq(method: string, body?: unknown) {
    return new Request('http://localhost/api/admin/settings/smtp', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/settings/smtp', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('falls back to environment defaults when no settings are stored', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.settings).toHaveProperty('smtp_host');
        expect(body.settings).toHaveProperty('smtp_user');
        // password must never be returned in clear text
        expect(['', '••••••••']).toContain(body.settings.smtp_password);
    });

    it('returns stored settings with masked password', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([
            { key: 'smtp_host',     value: 'mail.zenowethu.co.za',          updatedAt: new Date('2026-06-01') },
            { key: 'smtp_port',     value: '587',                            updatedAt: new Date('2026-06-01') },
            { key: 'smtp_user',     value: 'transfer@zenowethu.co.za',       updatedAt: new Date('2026-06-01') },
            { key: 'smtp_password', value: 'supersecret',                    updatedAt: new Date('2026-06-02') },
            { key: 'smtp_from',     value: 'notifications@zenowethu.co.za',  updatedAt: new Date('2026-06-01') },
        ] as any);
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.settings.smtp_host).toBe('mail.zenowethu.co.za');
        expect(body.settings.smtp_user).toBe('transfer@zenowethu.co.za');
        expect(body.settings.smtp_password).toBe('••••••••');
        expect(body.settings.smtp_from).toBe('notifications@zenowethu.co.za');
        expect(body.lastUpdated).toBeDefined();
    });

    it('allows executive role to read settings', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
        const res = await GET();
        expect(res.status).toBe(200);
    });
});

// ── POST ───────────────────────────────────────────────────────────────────

describe('POST /api/admin/settings/smtp', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await POST(makeReq('POST', validBody));
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await POST(makeReq('POST', validBody));
        expect(res.status).toBe(401);
    });

    it('returns 422 for missing host', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await POST(makeReq('POST', { ...validBody, host: undefined }));
        expect(res.status).toBe(422);
    });

    it('returns 422 when username is not a valid email address', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await POST(makeReq('POST', { ...validBody, username: 'not-an-email' }));
        expect(res.status).toBe(422);
    });

    it('returns 422 for an out-of-range port', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await POST(makeReq('POST', { ...validBody, port: 99999 }));
        expect(res.status).toBe(422);
    });

    it('saves settings and invalidates cache on success', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.upsert).mockResolvedValue({} as any);
        const res = await POST(makeReq('POST', validBody));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        // host, port, secure, user, from, password — all upserted
        expect(prisma.systemSettings.upsert).toHaveBeenCalledTimes(6);
        expect(invalidateSMTPCredentialsCache).toHaveBeenCalledOnce();
    });

    it('does not upsert password when masked placeholder is submitted', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.upsert).mockResolvedValue({} as any);
        const res = await POST(makeReq('POST', { ...validBody, password: '••••••••' }));
        expect(res.status).toBe(200);
        // host, port, secure, user, from — password skipped
        expect(prisma.systemSettings.upsert).toHaveBeenCalledTimes(5);
        expect(invalidateSMTPCredentialsCache).toHaveBeenCalledOnce();
    });

    it('allows executive to save settings', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        vi.mocked(prisma.systemSettings.upsert).mockResolvedValue({} as any);
        const res = await POST(makeReq('POST', validBody));
        expect(res.status).toBe(200);
    });
});

// ── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /api/admin/settings/smtp', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await DELETE();
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await DELETE();
        expect(res.status).toBe(401);
    });

    it('deletes all smtp settings and invalidates cache', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.deleteMany).mockResolvedValue({ count: 6 });
        const res = await DELETE();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(prisma.systemSettings.deleteMany).toHaveBeenCalledWith({ where: { category: 'smtp' } });
        expect(invalidateSMTPCredentialsCache).toHaveBeenCalledOnce();
    });
});
