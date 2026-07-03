import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        invoice: { findUnique: vi.fn(), update: vi.fn() },
        case: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
        referrer: { findUnique: vi.fn() },
        referrerCommission: { findUnique: vi.fn(), upsert: vi.fn() },
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

describe('POST /api/finance/quotes/[id]/decision (cases app)', () => {
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

    it('marks a sent quote as accepted and advances the linked case (forward-only)', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'quote-1', type: 'QUOTE', status: 'SENT', caseId: 'case-1', invoiceNumber: 'QUO-2026-0056',
        } as any);
        vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 'quote-1', status: 'ACCEPTED' } as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'ACCEPTED_VIA_DHS', referrerId: null,
        } as any);
        vi.mocked(prisma.case.update).mockResolvedValue({} as any);

        const res = await POST(makeRequest({ decision: 'ACCEPTED' }), { params });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.caseSync).toEqual({
            moved: true, fromStatus: 'ACCEPTED_VIA_DHS', toStatus: 'QUOTE_ACCEPTED',
        });
    });

    it('does not move a case backwards when it is already past QUOTE_ACCEPTED', async () => {
        vi.mocked(auth as any).mockResolvedValue(session);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'quote-1', type: 'QUOTE', status: 'SENT', caseId: 'case-1', invoiceNumber: 'QUO-2026-0056',
        } as any);
        vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 'quote-1', status: 'ACCEPTED' } as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'case-1', status: 'SETTLED_SUCCESS', referrerId: null,
        } as any);

        const res = await POST(makeRequest({ decision: 'ACCEPTED' }), { params });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.caseSync.moved).toBe(false);
        expect(json.caseSync.reason).toBe('NOT_FORWARD');
        expect(prisma.case.update).not.toHaveBeenCalled();
    });
});
