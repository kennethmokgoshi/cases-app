import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        invoice: { findUnique: vi.fn(), update: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { POST } from './route';

const session = { user: { id: 'u1', isAdmin: true } };
const params = Promise.resolve({ id: 'quote-1' });

function makeRequest(body: unknown) {
    return new Request('http://localhost/api/finance/quotes/quote-1/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/finance/quotes/[id]/decision', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth as any).mockResolvedValue(null);
        const res = await POST(makeRequest({ decision: 'ACCEPTED' }), { params });
        expect(res.status).toBe(401);
    });

    it('rejects invalid decisions', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        const res = await POST(makeRequest({ decision: 'MAYBE' }), { params });
        expect(res.status).toBe(422);
    });

    it('refuses to record a decision on an invoice', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'quote-1', type: 'INVOICE', status: 'SENT',
        } as any);
        const res = await POST(makeRequest({ decision: 'ACCEPTED' }), { params });
        expect(res.status).toBe(409);
    });

    it('refuses a decision on a converted quote', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'quote-1', type: 'QUOTE', status: 'CONVERTED',
        } as any);
        const res = await POST(makeRequest({ decision: 'REJECTED' }), { params });
        expect(res.status).toBe(409);
    });

    it('marks a sent quote as accepted with audit fields', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'quote-1', type: 'QUOTE', status: 'SENT',
        } as any);
        vi.mocked(prisma.invoice.update).mockImplementation((async (args: any) => ({
            id: 'quote-1', ...args.data,
        })) as any);

        const res = await POST(makeRequest({ decision: 'ACCEPTED', note: 'Client phoned in' }), { params });
        expect(res.status).toBe(200);

        const updateArgs = vi.mocked(prisma.invoice.update).mock.calls[0][0] as any;
        expect(updateArgs.data.status).toBe('ACCEPTED');
        expect(updateArgs.data.acceptedAt).toBeInstanceOf(Date);
        expect(updateArgs.data.rejectedAt).toBeNull();
        expect(updateArgs.data.decidedById).toBe('u1');
        expect(updateArgs.data.decisionNote).toBe('Client phoned in');
    });

    it('marks a quote as rejected and clears acceptedAt', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'quote-1', type: 'QUOTE', status: 'ACCEPTED',
        } as any);
        vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 'quote-1' } as any);

        const res = await POST(makeRequest({ decision: 'REJECTED' }), { params });
        expect(res.status).toBe(200);

        const updateArgs = vi.mocked(prisma.invoice.update).mock.calls[0][0] as any;
        expect(updateArgs.data.status).toBe('REJECTED');
        expect(updateArgs.data.rejectedAt).toBeInstanceOf(Date);
        expect(updateArgs.data.acceptedAt).toBeNull();
    });
});
