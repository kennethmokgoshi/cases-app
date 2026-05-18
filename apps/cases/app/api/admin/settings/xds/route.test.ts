import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    invalidateXDSCredentialsCache: vi.fn(),
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

import { auth, invalidateXDSCredentialsCache } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST, DELETE } from './route';

// ── Session fixtures ───────────────────────────────────────────────────────

const adminSession    = { user: { id: 'u1', isAdmin: true,  isExecutive: false } };
const executiveSession = { user: { id: 'u2', isAdmin: false, isExecutive: true  } };
const memberSession   = { user: { id: 'u3', isAdmin: false, isExecutive: false } };
const noSession       = null;

function makeReq(method: string, body?: unknown) {
    return new Request('http://localhost/api/admin/settings/xds', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/settings/xds', () => {
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

    it('returns empty defaults when no settings are stored', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([]);
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.settings.xds_username).toBe('');
        expect(body.settings.xds_portal_url).toBe('https://www.online.xds.co.za');
    });

    it('returns stored settings with masked password', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.findMany).mockResolvedValue([
            { key: 'xds_username',   value: 'testuser',                 updatedAt: new Date('2026-04-07') },
            { key: 'xds_password',   value: 'secret123',                updatedAt: new Date('2026-04-07') },
            { key: 'xds_portal_url', value: 'https://portal.xds.co.za', updatedAt: new Date('2026-04-07') },
        ] as any);
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.settings.xds_username).toBe('testuser');
        expect(body.settings.xds_password).toBe('••••••••');
        expect(body.settings.xds_portal_url).toBe('https://portal.xds.co.za');
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

describe('POST /api/admin/settings/xds', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(noSession as any);
        const res = await POST(makeReq('POST', { username: 'u', password: 'p', portalUrl: 'https://portal.xds.co.za' }));
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await POST(makeReq('POST', { username: 'u', password: 'p', portalUrl: 'https://portal.xds.co.za' }));
        expect(res.status).toBe(401);
    });

    it('returns 422 for missing username', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await POST(makeReq('POST', { password: 'p', portalUrl: 'https://portal.xds.co.za' }));
        expect(res.status).toBe(422);
    });

    it('returns 422 for invalid portal URL', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        const res = await POST(makeReq('POST', { username: 'u', password: 'p', portalUrl: 'not-a-url' }));
        expect(res.status).toBe(422);
    });

    it('saves credentials and invalidates cache on success', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.upsert).mockResolvedValue({} as any);
        const res = await POST(makeReq('POST', {
            username: 'xdsuser',
            password: 'newpassword',
            portalUrl: 'https://portal.xds.co.za',
        }));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        // username, portal URL, and password all upserted
        expect(prisma.systemSettings.upsert).toHaveBeenCalledTimes(3);
        expect(invalidateXDSCredentialsCache).toHaveBeenCalledOnce();
    });

    it('does not upsert password when masked placeholder is submitted', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.upsert).mockResolvedValue({} as any);
        const res = await POST(makeReq('POST', {
            username: 'xdsuser',
            password: '••••••••',
            portalUrl: 'https://portal.xds.co.za',
        }));
        expect(res.status).toBe(200);
        // only username + portalUrl upserted — password skipped
        expect(prisma.systemSettings.upsert).toHaveBeenCalledTimes(2);
        expect(invalidateXDSCredentialsCache).toHaveBeenCalledOnce();
    });

    it('allows executive to save credentials', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        vi.mocked(prisma.systemSettings.upsert).mockResolvedValue({} as any);
        const res = await POST(makeReq('POST', {
            username: 'xdsuser',
            password: 'pass',
            portalUrl: 'https://portal.xds.co.za',
        }));
        expect(res.status).toBe(200);
    });
});

// ── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /api/admin/settings/xds', () => {
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

    it('deletes all xds settings and invalidates cache', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(prisma.systemSettings.deleteMany).mockResolvedValue({ count: 3 });
        const res = await DELETE();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(prisma.systemSettings.deleteMany).toHaveBeenCalledWith({ where: { category: 'xds' } });
        expect(invalidateXDSCredentialsCache).toHaveBeenCalledOnce();
    });

    it('allows executive to reset credentials', async () => {
        vi.mocked(auth).mockResolvedValue(executiveSession as any);
        vi.mocked(prisma.systemSettings.deleteMany).mockResolvedValue({ count: 3 });
        const res = await DELETE();
        expect(res.status).toBe(200);
    });
});
