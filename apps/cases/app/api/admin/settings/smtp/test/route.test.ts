import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const verifyMock = vi.fn();

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({ verify: verifyMock })),
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    getSMTPCredentials: vi.fn(),
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

import { auth, getSMTPCredentials } from '@zenowethu/shared-lib';
import { POST } from './route';

const adminSession  = { user: { id: 'u1', isAdmin: true,  isExecutive: false } };
const memberSession = { user: { id: 'u3', isAdmin: false, isExecutive: false } };

const savedCreds = {
    host: 'mail.zenowethu.co.za',
    port: 587,
    secure: false,
    username: 'transfer@zenowethu.co.za',
    password: 'savedSecret',
    fromEmail: 'notifications@zenowethu.co.za',
};

function makeReq(body?: unknown) {
    return new Request('http://localhost/api/admin/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSMTPCredentials).mockResolvedValue(savedCreds);
});

describe('POST /api/admin/settings/smtp/test', () => {
    it('returns 401 for unauthenticated requests', async () => {
        vi.mocked(auth).mockResolvedValue(null as any);
        const res = await POST(makeReq());
        expect(res.status).toBe(401);
    });

    it('returns 401 for non-admin non-executive', async () => {
        vi.mocked(auth).mockResolvedValue(memberSession as any);
        const res = await POST(makeReq());
        expect(res.status).toBe(401);
    });

    it('reports success when SMTP login verifies with saved credentials', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        verifyMock.mockResolvedValue(true);
        const res = await POST(makeReq());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(verifyMock).toHaveBeenCalledOnce();
    });

    it('reports failure detail when SMTP login is rejected', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        verifyMock.mockRejectedValue(new Error('Invalid login: 535 Incorrect authentication data'));
        const res = await POST(makeReq());
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('535');
    });

    it('uses an unmasked override password instead of the saved one', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        verifyMock.mockResolvedValue(true);
        const nodemailer = (await import('nodemailer')).default;
        await POST(makeReq({ password: 'newPassword123' }));
        expect(vi.mocked(nodemailer.createTransport)).toHaveBeenCalledWith(
            expect.objectContaining({ auth: { user: savedCreds.username, pass: 'newPassword123' } }),
        );
    });

    it('ignores a masked override password and keeps the saved one', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        verifyMock.mockResolvedValue(true);
        const nodemailer = (await import('nodemailer')).default;
        await POST(makeReq({ password: '••••••••' }));
        expect(vi.mocked(nodemailer.createTransport)).toHaveBeenCalledWith(
            expect.objectContaining({ auth: { user: savedCreds.username, pass: savedCreds.password } }),
        );
    });

    it('returns 400 when nothing is configured at all', async () => {
        vi.mocked(auth).mockResolvedValue(adminSession as any);
        vi.mocked(getSMTPCredentials).mockResolvedValue({
            host: '', port: 587, secure: false, username: '', password: '', fromEmail: '',
        });
        const res = await POST(makeReq());
        expect(res.status).toBe(400);
    });
});
