import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        creditProvider: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        creditAccount: {
            updateMany: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST } from './route';
import { GET as GET_ID, PATCH, DELETE } from './[id]/route';

const mockAdmin = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false } };
const mockExecutive = { user: { id: 'u2', isAdmin: false, isExecutive: true, isSeniorManager: false } };
const mockSeniorManager = { user: { id: 'u3', isAdmin: false, isExecutive: false, isSeniorManager: true } };
const mockMember = { user: { id: 'u4', isAdmin: false, isExecutive: false, isSeniorManager: false } };
const unauthenticated = null;

const sampleProvider = {
    id: 'cp-1',
    name: 'FNB',
    type: 'BANK',
    email: 'fnb@example.com',
    phone: null,
    address: null,
    attorney: null,
    attorneyEmail: null,
    attorneyPhone: null,
    isActive: true,
    createdAt: new Date('2026-03-24'),
    updatedAt: new Date('2026-03-24'),
};

function makeReq(url: string, method = 'GET', body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

function makeIdReq(id: string, method = 'GET', body?: unknown) {
    return {
        req: makeReq(`http://localhost/api/admin/credit-providers/${id}`, method, body),
        ctx: { params: Promise.resolve({ id }) },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── GET (list) ──────────────────────────────────────────────────────────────

describe('GET /api/admin/credit-providers', () => {
    it('returns 401 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const res = await GET(makeReq('http://localhost/api/admin/credit-providers'));
        expect(res.status).toBe(401);
    });

    it('returns paginated providers for any authenticated user', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        vi.mocked(prisma.creditProvider.findMany).mockResolvedValue([sampleProvider] as any);
        vi.mocked(prisma.creditProvider.count)
            .mockResolvedValueOnce(1)  // filtered total
            .mockResolvedValueOnce(5)  // overall total
            .mockResolvedValueOnce(4); // active total
        const res = await GET(makeReq('http://localhost/api/admin/credit-providers'));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.providers).toHaveLength(1);
        expect(body.meta.total).toBe(5);
        expect(body.meta.active).toBe(4);
        expect(body.meta.inactive).toBe(1);
    });

    it('passes search and type filters to prisma', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.creditProvider.findMany).mockResolvedValue([]);
        vi.mocked(prisma.creditProvider.count).mockResolvedValue(0);
        await GET(makeReq('http://localhost/api/admin/credit-providers?search=FNB&type=BANK&isActive=true'));
        const callArgs = vi.mocked(prisma.creditProvider.findMany).mock.calls[0][0] as any;
        expect(callArgs.where.name).toEqual({ contains: 'FNB', mode: 'insensitive' });
        expect(callArgs.where.type).toBe('BANK');
        expect(callArgs.where.isActive).toBe(true);
    });
});

// ── POST ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/credit-providers', () => {
    it('returns 401 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const res = await POST(makeReq('http://localhost/api/admin/credit-providers', 'POST', { name: 'X', type: 'BANK' }));
        expect(res.status).toBe(401);
    });

    it('returns 403 for member role', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        const res = await POST(makeReq('http://localhost/api/admin/credit-providers', 'POST', { name: 'X', type: 'BANK' }));
        expect(res.status).toBe(403);
    });

    it('returns 422 for missing required fields', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        const res = await POST(makeReq('http://localhost/api/admin/credit-providers', 'POST', { name: 'X' }));
        expect(res.status).toBe(422);
    });

    it('creates a credit provider and returns 201', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.creditProvider.create).mockResolvedValue(sampleProvider as any);
        const res = await POST(makeReq('http://localhost/api/admin/credit-providers', 'POST', {
            name: 'FNB',
            type: 'BANK',
            email: 'fnb@example.com',
        }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.name).toBe('FNB');
    });

    it('returns 409 on duplicate name', async () => {
        vi.mocked(auth).mockResolvedValue(mockExecutive as any);
        const err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        vi.mocked(prisma.creditProvider.create).mockRejectedValue(err);
        const res = await POST(makeReq('http://localhost/api/admin/credit-providers', 'POST', { name: 'FNB', type: 'BANK' }));
        expect(res.status).toBe(409);
    });
});

// ── GET [id] ────────────────────────────────────────────────────────────────

describe('GET /api/admin/credit-providers/[id]', () => {
    it('returns 401 when not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(unauthenticated as any);
        const { req, ctx } = makeIdReq('cp-1');
        const res = await GET_ID(req, ctx);
        expect(res.status).toBe(401);
    });

    it('returns 404 when provider not found', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(null);
        const { req, ctx } = makeIdReq('missing');
        const res = await GET_ID(req, ctx);
        expect(res.status).toBe(404);
    });

    it('returns provider for any authenticated user', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(sampleProvider as any);
        const { req, ctx } = makeIdReq('cp-1');
        const res = await GET_ID(req, ctx);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.name).toBe('FNB');
    });
});

// ── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /api/admin/credit-providers/[id]', () => {
    it('returns 403 for member role', async () => {
        vi.mocked(auth).mockResolvedValue(mockMember as any);
        const { req, ctx } = makeIdReq('cp-1', 'PATCH', { email: 'new@example.com' });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(403);
    });

    it('returns 404 if not found', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(null);
        const { req, ctx } = makeIdReq('missing', 'PATCH', { email: 'new@example.com' });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(404);
    });

    it('updates and returns the provider', async () => {
        vi.mocked(auth).mockResolvedValue(mockSeniorManager as any);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(sampleProvider as any);
        vi.mocked(prisma.creditProvider.update).mockResolvedValue({ ...sampleProvider, email: 'new@fnb.com' } as any);
        const { req, ctx } = makeIdReq('cp-1', 'PATCH', { email: 'new@fnb.com' });
        const res = await PATCH(req, ctx);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.email).toBe('new@fnb.com');
    });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/admin/credit-providers/[id]', () => {
    it('returns 403 for senior manager (not admin/executive)', async () => {
        vi.mocked(auth).mockResolvedValue(mockSeniorManager as any);
        const { req, ctx } = makeIdReq('cp-1', 'DELETE');
        const res = await DELETE(req, ctx);
        expect(res.status).toBe(403);
    });

    it('returns 404 when provider not found', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(null);
        const { req, ctx } = makeIdReq('missing', 'DELETE');
        const res = await DELETE(req, ctx);
        expect(res.status).toBe(404);
    });

    it('unlinks credit accounts and deletes provider', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdmin as any);
        vi.mocked(prisma.creditProvider.findUnique).mockResolvedValue(sampleProvider as any);
        vi.mocked(prisma.creditAccount.updateMany).mockResolvedValue({ count: 2 });
        vi.mocked(prisma.creditProvider.delete).mockResolvedValue(sampleProvider as any);
        const { req, ctx } = makeIdReq('cp-1', 'DELETE');
        const res = await DELETE(req, ctx);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(prisma.creditAccount.updateMany).toHaveBeenCalledWith({
            where: { creditProviderId: 'cp-1' },
            data: { creditProviderId: null },
        });
        expect(prisma.creditProvider.delete).toHaveBeenCalledWith({ where: { id: 'cp-1' } });
    });
});
