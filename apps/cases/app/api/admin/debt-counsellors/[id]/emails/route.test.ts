import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { getDcPriorityEmails } from '@zenowethu/shared-lib/src/dc/email-priority';
import { PUT } from './route';

vi.mock('@zenowethu/database', () => {
    const db = {
        debtCounsellor: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        debtCounsellorEmail: {
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        debtCounsellorEmailHistory: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        $transaction: vi.fn(),
    };
    return { prisma: db };
});

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('@zenowethu/shared-lib/src/dc/email-priority', () => ({
    MAX_PRIORITY_EMAILS: 5,
    normalizeDcEmail: (e: string) => e.trim().toLowerCase(),
    getDcPriorityEmails: vi.fn(),
}));

const db = prisma as any;

function makeRequest(body: unknown) {
    return new Request('http://localhost/api/admin/debt-counsellors/dc1/emails', {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

const params = { params: Promise.resolve({ id: 'dc1' }) };

describe('PUT /api/admin/debt-counsellors/[id]/emails', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'admin1', isAdmin: true, firstName: 'Aaron', lastName: 'Nzotho' },
        } as any);
        db.debtCounsellor.findUnique.mockResolvedValue({ id: 'dc1' });
        db.debtCounsellor.update.mockResolvedValue({});
        db.$transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => fn(db));
        db.debtCounsellorEmail.create.mockResolvedValue({});
        db.debtCounsellorEmail.update.mockResolvedValue({});
        db.debtCounsellorEmail.delete.mockResolvedValue({});
        db.debtCounsellorEmailHistory.findFirst.mockResolvedValue({ id: 'seen' });
        vi.mocked(getDcPriorityEmails).mockResolvedValue([]);
    });

    it('rejects non-admin users', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1', isAdmin: false } } as any);

        const res = await PUT(makeRequest({ emails: [] }), params);
        expect(res.status).toBe(403);
    });

    it('rejects more than 5 emails', async () => {
        const emails = Array.from({ length: 6 }, (_, i) => ({ email: `e${i}@dc.co.za` }));
        const res = await PUT(makeRequest({ emails }), params);
        expect(res.status).toBe(400);
    });

    it('rejects duplicate addresses', async () => {
        const res = await PUT(
            makeRequest({ emails: [{ email: 'same@dc.co.za' }, { email: 'SAME@dc.co.za' }] }),
            params
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Duplicate');
    });

    it('replaces the list in order: removes missing, creates new, reprioritises kept', async () => {
        vi.mocked(getDcPriorityEmails)
            .mockResolvedValueOnce([
                { id: 'e1', email: 'keep@dc.co.za', priority: 1, source: 'DHS', lastBouncedAt: null, bounceReason: null, notes: null },
                { id: 'e2', email: 'gone@dc.co.za', priority: 2, source: 'DHS', lastBouncedAt: null, bounceReason: null, notes: null },
            ])
            .mockResolvedValueOnce([
                { id: 'e3', email: 'new@dc.co.za', priority: 1, source: 'STAFF', lastBouncedAt: null, bounceReason: null, notes: null },
                { id: 'e1', email: 'keep@dc.co.za', priority: 2, source: 'DHS', lastBouncedAt: null, bounceReason: null, notes: null },
            ]);

        const res = await PUT(
            makeRequest({ emails: [{ email: 'new@dc.co.za' }, { email: 'keep@dc.co.za' }] }),
            params
        );

        expect(res.status).toBe(200);
        expect(db.debtCounsellorEmail.delete).toHaveBeenCalledWith({ where: { id: 'e2' } });
        expect(db.debtCounsellorEmail.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ email: 'new@dc.co.za', priority: 1, source: 'STAFF' }),
        });
        expect(db.debtCounsellorEmail.update).toHaveBeenCalledWith({
            where: { id: 'e1' },
            data: expect.objectContaining({ priority: 2 }),
        });
        // preferredEmail synced to the new best entry
        expect(db.debtCounsellor.update).toHaveBeenCalledWith({
            where: { id: 'dc1' },
            data: expect.objectContaining({ preferredEmail: 'new@dc.co.za' }),
        });
    });

    it('returns 404 for an unknown debt counsellor', async () => {
        db.debtCounsellor.findUnique.mockResolvedValue(null);
        const res = await PUT(makeRequest({ emails: [] }), params);
        expect(res.status).toBe(404);
    });
});
