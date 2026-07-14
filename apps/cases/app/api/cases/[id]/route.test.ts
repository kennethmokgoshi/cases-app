import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    sendStatusChangeNotification: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        project: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/project-path', () => ({
    buildProjectDisplayName: (id: string) => `path/${id}`,
}));

import { GET } from './route';
import { auth } from '@zenowethu/shared-lib/src/auth';
import { prisma } from '@zenowethu/database';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    project: { findMany: ReturnType<typeof vi.fn> };
};

const params = Promise.resolve({ id: 'case1' });
const request = () => new Request('https://app.zenowethu.co.za/api/cases/case1');

const baseCase = {
    id: 'case1',
    fileNumber: 'ZC0001',
    projects: [],
    documents: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: 'staff1' } } as never);
    db.project.findMany.mockResolvedValue([]);
});

describe('GET /api/cases/[id] — quote visibility', () => {
    it('returns the case quotes newest-first so staff can see sent/accepted/rejected state', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            invoices: [
                {
                    id: 'q2',
                    invoiceNumber: 'QUO2026-002',
                    status: 'ACCEPTED',
                    total: '4500',
                    issuedAt: new Date('2026-07-01'),
                    sentAt: new Date('2026-07-01'),
                    sentTo: 'client@example.com',
                    acceptedAt: new Date('2026-07-03'),
                    rejectedAt: null,
                    decisionNote: null,
                    convertedToInvoiceId: null,
                },
                {
                    id: 'q1',
                    invoiceNumber: 'QUO2026-001',
                    status: 'REJECTED',
                    total: '6000',
                    issuedAt: new Date('2026-06-20'),
                    sentAt: new Date('2026-06-20'),
                    sentTo: 'client@example.com',
                    acceptedAt: null,
                    rejectedAt: new Date('2026-06-22'),
                    decisionNote: 'Too expensive',
                    convertedToInvoiceId: null,
                },
            ],
        });

        const res = await GET(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.quotes).toHaveLength(2);
        expect(json.quotes[0].invoiceNumber).toBe('QUO2026-002');
        expect(json.quotes[0].status).toBe('ACCEPTED');
        expect(json.quotes[1].status).toBe('REJECTED');
        expect(json.quotes[1].decisionNote).toBe('Too expensive');
        // Raw relation key is not leaked alongside the renamed field
        expect(json.invoices).toBeUndefined();
    });

    it('requests only client quotations (type QUOTE), excluding DC fee quotes', async () => {
        db.case.findUnique.mockResolvedValue({ ...baseCase, invoices: [] });

        await GET(request(), { params });

        const include = db.case.findUnique.mock.calls[0][0].include;
        expect(include.invoices.where).toEqual({ type: 'QUOTE' });
        expect(include.invoices.orderBy).toEqual({ issuedAt: 'desc' });
    });

    it('returns an empty quotes array when the case has no quotes', async () => {
        db.case.findUnique.mockResolvedValue({ ...baseCase, invoices: [] });

        const json = await (await GET(request(), { params })).json();
        expect(json.quotes).toEqual([]);
    });

    it('rejects unauthenticated callers', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        expect((await GET(request(), { params })).status).toBe(401);
        expect(db.case.findUnique).not.toHaveBeenCalled();
    });
});

describe('GET /api/cases/[id] — referrer visibility', () => {
    it('requests the linked referrer so staff can spot wrongly assigned referrals', async () => {
        db.case.findUnique.mockResolvedValue({ ...baseCase, invoices: [] });

        await GET(request(), { params });

        const include = db.case.findUnique.mock.calls[0][0].include;
        expect(include.referrer.select).toEqual(
            expect.objectContaining({
                id: true,
                firstName: true,
                lastName: true,
                referrerType: true,
                isActive: true,
            })
        );
    });

    it('passes the referrer through in the response', async () => {
        const referrer = {
            id: 'ref1',
            firstName: 'William',
            lastName: 'Maesela',
            email: 'william@example.com',
            cellNumber: '0820000000',
            referrerType: 'COMMISSION',
            isActive: true,
        };
        db.case.findUnique.mockResolvedValue({ ...baseCase, invoices: [], referrer });

        const json = await (await GET(request(), { params })).json();
        expect(json.referrer).toEqual(referrer);
    });

    it('returns a null referrer for cases without one', async () => {
        db.case.findUnique.mockResolvedValue({ ...baseCase, invoices: [], referrer: null });

        const json = await (await GET(request(), { params })).json();
        expect(json.referrer).toBeNull();
    });
});
