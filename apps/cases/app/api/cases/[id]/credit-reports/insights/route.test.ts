import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const session = { user: { id: 'user-1', email: 'staff@example.com' } };

describe('GET /api/cases/[id]/credit-reports/insights', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(auth).mockResolvedValue(session as never);
    });

    it('returns 401 if unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/cases/c1/credit-reports/insights') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 404 when the case does not exist', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/cases/c1/credit-reports/insights') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        expect(res.status).toBe(404);
    });

    it('reports hasCreditReports false when there are no credit report documents', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: 'c1', documents: [] } as never);
        const res = await GET(new Request('http://localhost/api/cases/c1/credit-reports/insights') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.hasCreditReports).toBe(false);
        expect(data.reports).toHaveLength(0);
    });

    it('lists unanalyzed reports separately from parsed insight reports', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CREDIT_REPORT_EXPERIAN', fileName: 'analyzed.pdf', extractedData: JSON.stringify({ adverseListings: [] }), analyzedAt: new Date() },
                { id: 'd2', type: 'CREDIT_REPORT_XDS', fileName: 'pending.pdf', extractedData: null, analyzedAt: null },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/credit-reports/insights') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.hasCreditReports).toBe(true);
        expect(data.reports).toHaveLength(1);
        expect(data.reports[0].documentId).toBe('d1');
        expect(data.unanalyzedReports).toHaveLength(1);
        expect(data.unanalyzedReports[0].id).toBe('d2');
    });

    it('computes insights for each analyzed report', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                {
                    id: 'd1',
                    type: 'CREDIT_REPORT_EXPERIAN',
                    fileName: 'report.pdf',
                    analyzedAt: new Date(),
                    extractedData: JSON.stringify({
                        adverseListings: [],
                        creditScore: { score: 700, band: 'Good' },
                        enquirySummary: { totalLast12Months: 1, excessiveFlag: false },
                    }),
                },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/credit-reports/insights') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.reports[0].insights.some((i: any) => i.category === 'positive')).toBe(true);
    });

    it('does not throw when extractedData is malformed JSON', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CREDIT_REPORT', fileName: 'broken.pdf', extractedData: 'not-json', analyzedAt: new Date() },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/credit-reports/insights') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.reports).toHaveLength(1);
        // Malformed JSON falls back to an empty extracted-data object rather than throwing;
        // an empty object has no adverse listings, so it still yields the "no adverse listings" signal.
        expect(data.reports[0].insights).toEqual([
            { category: 'positive', title: 'No adverse listings', detail: 'No handed-over, written-off, judgment, or default accounts recorded on this report.' },
        ]);
    });
});
