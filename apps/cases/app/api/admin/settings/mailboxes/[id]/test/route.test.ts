import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        mailboxAccount: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })),
    getSMTPCredentials: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/integrations/imap', () => ({
    verifyImapConnection: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { auth, getSMTPCredentials } from '@zenowethu/shared-lib';
import { verifyImapConnection } from '@zenowethu/shared-lib/src/integrations/imap';
import { POST } from './route';

const db = prisma as unknown as { mailboxAccount: { findUnique: ReturnType<typeof vi.fn> } };
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedSmtp = getSMTPCredentials as unknown as ReturnType<typeof vi.fn>;
const mockedVerify = verifyImapConnection as unknown as ReturnType<typeof vi.fn>;

const params = { params: Promise.resolve({ id: 'mbx-1' }) };
const request = () => new Request('https://cases.zenowethu.co.za/api/admin/settings/mailboxes/mbx-1/test', { method: 'POST' });

const MAILBOX = {
    id: 'mbx-1',
    emailAddress: 'transfers@zenowethu.co.za',
    imapHost: 'mail.zenowethu.co.za',
    imapPort: 993,
    imapSecure: true,
    // not enc:v1-prefixed, so decryptSecret passes it through unchanged
    password: 'plain-password',
    ownerUserId: null,
};

describe('POST /api/admin/settings/mailboxes/[id]/test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue(MAILBOX);
        mockedSmtp.mockResolvedValue({ username: '', password: '' });
        mockedVerify.mockResolvedValue({ success: true, message: 'Login successful as transfers@zenowethu.co.za' });
    });

    it('verifies the IMAP connection with the saved mailbox password', async () => {
        const response = await POST(request(), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(mockedVerify).toHaveBeenCalledWith({
            host: 'mail.zenowethu.co.za',
            port: 993,
            secure: true,
            username: 'transfers@zenowethu.co.za',
            password: 'plain-password',
        });
    });

    it('falls back to the SMTP account password when the address matches the SMTP login', async () => {
        db.mailboxAccount.findUnique.mockResolvedValue({
            ...MAILBOX,
            emailAddress: 'notifications@zenowethu.co.za',
            password: null,
        });
        mockedSmtp.mockResolvedValue({ username: 'notifications@zenowethu.co.za', password: 'smtp-secret' });

        const response = await POST(request(), params);
        const body = await response.json();

        expect(body.success).toBe(true);
        expect(mockedVerify).toHaveBeenCalledWith(expect.objectContaining({ password: 'smtp-secret' }));
    });

    it('returns 400 when no password is available', async () => {
        db.mailboxAccount.findUnique.mockResolvedValue({ ...MAILBOX, password: null });

        const response = await POST(request(), params);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        expect(mockedVerify).not.toHaveBeenCalled();
    });

    it('surfaces a failed connection as success:false', async () => {
        mockedVerify.mockResolvedValue({ success: false, error: 'Authentication failed' });

        const response = await POST(request(), params);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(false);
        expect(body.error).toBe('Authentication failed');
    });

    it("blocks staff from testing another user's personal mailbox but allows the owner and admins", async () => {
        db.mailboxAccount.findUnique.mockResolvedValue({ ...MAILBOX, ownerUserId: 'staff-2' });

        mockedAuth.mockResolvedValueOnce({ user: { id: 'staff-1', userType: 'STAFF' } });
        expect((await POST(request(), params)).status).toBe(403);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'staff-2', userType: 'STAFF' } });
        expect((await POST(request(), params)).status).toBe(200);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        expect((await POST(request(), params)).status).toBe(200);
    });

    it('rejects unauthenticated users, B2B partners, and unknown mailboxes', async () => {
        mockedAuth.mockResolvedValueOnce(null);
        expect((await POST(request(), params)).status).toBe(401);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'p1', userType: 'B2B_PARTNER' } });
        expect((await POST(request(), params)).status).toBe(403);

        db.mailboxAccount.findUnique.mockResolvedValueOnce(null);
        expect((await POST(request(), params)).status).toBe(404);
    });
});
