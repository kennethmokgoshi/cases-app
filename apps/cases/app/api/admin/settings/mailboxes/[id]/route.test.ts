import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        mailboxAccount: {
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
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
    getSMTPCredentials: vi.fn().mockResolvedValue({ username: '', password: '' }),
}));

import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { isEncryptedSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { PATCH, DELETE } from './route';

type PrismaMock = {
    mailboxAccount: {
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
    };
};

const db = prisma as unknown as PrismaMock;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

function patchRequest(body: Record<string, unknown>): Request {
    return new Request('https://cases.zenowethu.co.za/api/admin/settings/mailboxes/mbx-1', {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}

const params = { params: Promise.resolve({ id: 'mbx-1' }) };

const UPDATED_ROW = {
    id: 'mbx-1',
    label: 'Transfers',
    emailAddress: 'transfers@zenowethu.co.za',
    imapHost: 'mail.zenowethu.co.za',
    imapPort: 993,
    imapSecure: true,
    isDcCommunication: true,
    isActive: true,
    ownerUserId: null,
    notes: null,
    lastCheckedAt: null,
    updatedAt: new Date('2026-07-11T00:00:00.000Z'),
    password: 'enc:v1:a:b:c',
    owner: null,
};

describe('PATCH /api/admin/settings/mailboxes/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AUTH_SECRET = 'test-secret';
        db.mailboxAccount.update.mockResolvedValue(UPDATED_ROW);
    });

    it('lets an admin update a shared mailbox password (stored encrypted)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: null, emailAddress: 'transfers@zenowethu.co.za' });

        const response = await PATCH(patchRequest({ password: 'new-password' }), params);

        expect(response.status).toBe(200);
        const data = db.mailboxAccount.update.mock.calls[0][0].data;
        expect(isEncryptedSecret(data.password)).toBe(true);
        expect(data.password).not.toContain('new-password');
    });

    it('blocks non-admin staff from updating a shared mailbox', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: null, emailAddress: 'transfers@zenowethu.co.za' });

        const response = await PATCH(patchRequest({ password: 'hax' }), params);

        expect(response.status).toBe(403);
        expect(db.mailboxAccount.update).not.toHaveBeenCalled();
    });

    it("blocks an admin from changing another user's personal mailbox password", async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: 'staff-2', emailAddress: 'staff2@zenowethu.co.za' });

        const response = await PATCH(patchRequest({ password: 'new-password' }), params);
        const body = await response.json();

        expect(response.status).toBe(403);
        expect(body.error).toContain('managed by its owner');
        expect(db.mailboxAccount.update).not.toHaveBeenCalled();
    });

    it("lets an admin enable/disable another user's personal mailbox", async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: 'staff-2', emailAddress: 'staff2@zenowethu.co.za' });

        const response = await PATCH(patchRequest({ isActive: false }), params);

        expect(response.status).toBe(200);
        expect(db.mailboxAccount.update.mock.calls[0][0].data.isActive).toBe(false);
    });

    it('lets the owner update their own personal mailbox including the password', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'staff-2', userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: 'staff-2', emailAddress: 'staff2@zenowethu.co.za' });

        const response = await PATCH(patchRequest({ password: 'my-own-password', imapHost: 'imap.gmail.com' }), params);

        expect(response.status).toBe(200);
        const data = db.mailboxAccount.update.mock.calls[0][0].data;
        expect(data.imapHost).toBe('imap.gmail.com');
        expect(isEncryptedSecret(data.password)).toBe(true);
    });

    it('ignores the masked password placeholder', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: null, emailAddress: 'transfers@zenowethu.co.za' });

        const response = await PATCH(patchRequest({ label: 'Renamed', password: '••••••••' }), params);

        expect(response.status).toBe(200);
        const data = db.mailboxAccount.update.mock.calls[0][0].data;
        expect(data.label).toBe('Renamed');
        expect(data.password).toBeUndefined();
    });

    it('returns 404 for an unknown mailbox', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue(null);

        expect((await PATCH(patchRequest({ label: 'x' }), params)).status).toBe(404);
    });
});

describe('DELETE /api/admin/settings/mailboxes/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.mailboxAccount.delete.mockResolvedValue({});
    });

    it('lets an admin delete a shared mailbox but blocks regular staff', async () => {
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: null, emailAddress: 'transfers@zenowethu.co.za' });

        mockedAuth.mockResolvedValueOnce({ user: { id: 'staff-1', userType: 'STAFF' } });
        expect((await DELETE(new Request('https://x'), params)).status).toBe(403);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        expect((await DELETE(new Request('https://x'), params)).status).toBe(200);
        expect(db.mailboxAccount.delete).toHaveBeenCalledTimes(1);
    });

    it('lets the owner delete their own personal mailbox', async () => {
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'mbx-1', ownerUserId: 'staff-2', emailAddress: 'staff2@zenowethu.co.za' });
        mockedAuth.mockResolvedValue({ user: { id: 'staff-2', userType: 'STAFF' } });

        expect((await DELETE(new Request('https://x'), params)).status).toBe(200);
    });
});
