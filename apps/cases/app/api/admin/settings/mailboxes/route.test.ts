import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        mailboxAccount: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
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

import { prisma } from '@zenowethu/database';
import { auth, getSMTPCredentials } from '@zenowethu/shared-lib';
import { isEncryptedSecret } from '@zenowethu/shared-lib/src/security/encryption';
import { GET, POST } from './route';

type PrismaMock = {
    mailboxAccount: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
    };
};

const db = prisma as unknown as PrismaMock;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedSmtp = getSMTPCredentials as unknown as ReturnType<typeof vi.fn>;

function postRequest(body: Record<string, unknown>): Request {
    return new Request('https://cases.zenowethu.co.za/api/admin/settings/mailboxes', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

const SHARED_ROW = {
    id: 'mbx-shared',
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

const PERSONAL_ROW = {
    ...SHARED_ROW,
    id: 'mbx-personal',
    emailAddress: 'staff1@zenowethu.co.za',
    ownerUserId: 'staff-1',
    password: null,
    owner: { firstName: 'Thabo', lastName: 'M' },
};

describe('GET /api/admin/settings/mailboxes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AUTH_SECRET = 'test-secret';
        mockedSmtp.mockResolvedValue({ username: '', password: '' });
    });

    it('returns shared and personal mailboxes with hasPassword instead of the password', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        db.mailboxAccount.findMany.mockResolvedValue([SHARED_ROW, PERSONAL_ROW]);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.shared).toHaveLength(1);
        expect(body.shared[0].hasPassword).toBe(true);
        expect(body.shared[0].password).toBeUndefined();
        expect(body.personal.id).toBe('mbx-personal');
        expect(body.personal.hasPassword).toBe(false);
        // Non-privileged callers are filtered at the query level
        const where = db.mailboxAccount.findMany.mock.calls[0][0].where;
        expect(where.OR).toEqual([
            { ownerUserId: null, isActive: true },
            { ownerUserId: 'staff-1' },
        ]);
    });

    it('reports the SMTP account password for a mailbox matching the SMTP login', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        mockedSmtp.mockResolvedValue({ username: 'Notifications@Zenowethu.co.za', password: 'smtp-secret' });
        db.mailboxAccount.findMany.mockResolvedValue([
            { ...SHARED_ROW, id: 'mbx-notifications', emailAddress: 'notifications@zenowethu.co.za', password: null },
        ]);

        const response = await GET();
        const body = await response.json();

        expect(body.shared[0].hasPassword).toBe(true);
        expect(body.shared[0].passwordSource).toBe('smtp');
    });

    it('lets admins see other users personal mailboxes read-only', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findMany.mockResolvedValue([SHARED_ROW, PERSONAL_ROW]);

        const response = await GET();
        const body = await response.json();

        expect(body.otherPersonal).toHaveLength(1);
        expect(body.otherPersonal[0].ownerName).toBe('Thabo M');
    });

    it('rejects unauthenticated users and B2B partners', async () => {
        mockedAuth.mockResolvedValueOnce(null);
        expect((await GET()).status).toBe(401);

        mockedAuth.mockResolvedValueOnce({ user: { id: 'p1', userType: 'B2B_PARTNER' } });
        expect((await GET()).status).toBe(403);
    });
});

describe('POST /api/admin/settings/mailboxes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.AUTH_SECRET = 'test-secret';
        mockedSmtp.mockResolvedValue({ username: '', password: '' });
        db.mailboxAccount.findUnique.mockResolvedValue(null);
        db.mailboxAccount.create.mockResolvedValue(SHARED_ROW);
    });

    it('blocks non-admin staff from creating shared mailboxes', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });

        const response = await POST(postRequest({
            scope: 'SHARED',
            label: 'Transfers',
            emailAddress: 'transfers@zenowethu.co.za',
            imapHost: 'mail.zenowethu.co.za',
        }));

        expect(response.status).toBe(403);
        expect(db.mailboxAccount.create).not.toHaveBeenCalled();
    });

    it('lets an admin create a shared mailbox with an encrypted password', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });

        const response = await POST(postRequest({
            scope: 'SHARED',
            label: 'Transfers',
            emailAddress: 'Transfers@Zenowethu.co.za',
            imapHost: 'mail.zenowethu.co.za',
            password: 'super-secret',
        }));

        expect(response.status).toBe(201);
        const data = db.mailboxAccount.create.mock.calls[0][0].data;
        expect(data.ownerUserId).toBeNull();
        expect(data.emailAddress).toBe('transfers@zenowethu.co.za'); // lowercased
        expect(isEncryptedSecret(data.password)).toBe(true);
        expect(data.password).not.toContain('super-secret');
    });

    it('lets staff register their own personal mailbox but only one', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'staff-1', userType: 'STAFF' } });
        db.mailboxAccount.create.mockResolvedValue(PERSONAL_ROW);

        const response = await POST(postRequest({
            scope: 'PERSONAL',
            label: 'My inbox',
            emailAddress: 'staff1@zenowethu.co.za',
            imapHost: 'mail.zenowethu.co.za',
        }));
        expect(response.status).toBe(201);
        expect(db.mailboxAccount.create.mock.calls[0][0].data.ownerUserId).toBe('staff-1');

        // Second registration is rejected
        db.mailboxAccount.findUnique.mockResolvedValueOnce({ id: 'mbx-personal' });
        const second = await POST(postRequest({
            scope: 'PERSONAL',
            label: 'Another',
            emailAddress: 'other@zenowethu.co.za',
            imapHost: 'mail.zenowethu.co.za',
        }));
        expect(second.status).toBe(409);
    });

    it('rejects a duplicate email address', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true, userType: 'STAFF' } });
        db.mailboxAccount.findUnique.mockResolvedValue({ id: 'existing' });

        const response = await POST(postRequest({
            scope: 'SHARED',
            label: 'Transfers',
            emailAddress: 'transfers@zenowethu.co.za',
            imapHost: 'mail.zenowethu.co.za',
        }));

        expect(response.status).toBe(409);
    });
});
