import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        systemSettings: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('fs/promises', () => ({
    writeFile: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(false),
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST, DELETE } from './route';

const mockAdminSession = { user: { id: 'user-1', isAdmin: true, isExecutive: false } };
const mockExecutiveSession = { user: { id: 'user-2', isAdmin: false, isExecutive: true } };
const mockMemberSession = { user: { id: 'user-3', isAdmin: false, isExecutive: false } };

beforeEach(() => {
    vi.clearAllMocks();
});

// ── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/settings/letterhead', () => {
    it('returns 401 when user is not admin or executive', async () => {
        vi.mocked(auth).mockResolvedValue(mockMemberSession as any);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('returns null url when no letterhead is set', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdminSession as any);
        vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue(null);
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.url).toBeNull();
    });

    it('returns existing letterhead url for executive', async () => {
        vi.mocked(auth).mockResolvedValue(mockExecutiveSession as any);
        vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue({
            key: 'letterhead_url',
            value: '/uploads/letterhead/letterhead-123.png',
            updatedAt: new Date('2026-03-24'),
        } as any);
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.url).toBe('/uploads/letterhead/letterhead-123.png');
    });
});

// ── POST ───────────────────────────────────────────────────────────────────

describe('POST /api/admin/settings/letterhead', () => {
    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(mockMemberSession as any);
        const formData = new FormData();
        const req = new Request('http://localhost/api/admin/settings/letterhead', {
            method: 'POST',
            body: formData,
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('returns 400 when no file is provided', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdminSession as any);
        const formData = new FormData();
        const req = new Request('http://localhost/api/admin/settings/letterhead', {
            method: 'POST',
            body: formData,
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('No file');
    });

    it('returns 400 for unsupported file type', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdminSession as any);
        const formData = new FormData();
        const badFile = new File(['data'], 'test.exe', { type: 'application/octet-stream' });
        formData.append('file', badFile);
        const req = new Request('http://localhost/api/admin/settings/letterhead', {
            method: 'POST',
            body: formData,
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Invalid file type');
    });

    it('returns 400 when file exceeds 5 MB', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdminSession as any);
        const formData = new FormData();
        const bigBuffer = new Uint8Array(6 * 1024 * 1024);
        const bigFile = new File([bigBuffer], 'big.png', { type: 'image/png' });
        formData.append('file', bigFile);
        const req = new Request('http://localhost/api/admin/settings/letterhead', {
            method: 'POST',
            body: formData,
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('too large');
    });
});

// ── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /api/admin/settings/letterhead', () => {
    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(mockMemberSession as any);
        const res = await DELETE();
        expect(res.status).toBe(401);
    });

    it('deletes the db record and returns success', async () => {
        vi.mocked(auth).mockResolvedValue(mockAdminSession as any);
        vi.mocked(prisma.systemSettings.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.systemSettings.deleteMany).mockResolvedValue({ count: 1 });
        const res = await DELETE();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(prisma.systemSettings.deleteMany).toHaveBeenCalledWith({ where: { key: 'letterhead_url' } });
    });
});
