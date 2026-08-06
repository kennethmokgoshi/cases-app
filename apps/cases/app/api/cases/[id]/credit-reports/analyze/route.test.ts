import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/openai', () => ({
    analyzeDocument: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        document: { update: vi.fn() },
    },
}));

vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('fs/promises', () => ({ readFile: vi.fn(async () => Buffer.from('fake-pdf')) }));

import { auth } from '@zenowethu/shared-lib';
import { analyzeDocument } from '@zenowethu/shared-lib/src/openai';
import { prisma } from '@zenowethu/database';
import { existsSync } from 'fs';
import { POST } from './route';

const session = { user: { id: 'user-1', email: 'staff@example.com' } };

function makeRequest(body: unknown) {
    return new Request('http://localhost/api/cases/c1/credit-reports/analyze', {
        method: 'POST',
        body: JSON.stringify(body),
    }) as never;
}

describe('POST /api/cases/[id]/credit-reports/analyze', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(auth).mockResolvedValue(session as never);
        vi.mocked(existsSync).mockReturnValue(true);
    });

    it('returns 401 if unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        expect(res.status).toBe(401);
    });

    it('returns 404 when the case does not exist', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null as never);
        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        expect(res.status).toBe(404);
    });

    it('reports no-op when there are no credit report documents', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [{ id: 'd1', type: 'ID', fileName: 'id.pdf', extractedData: null, fileUrl: '/uploads/id.pdf', mimeType: 'application/pdf' }],
        } as never);

        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.analyzed).toBe(0);
        expect(data.results).toHaveLength(0);
        expect(analyzeDocument).not.toHaveBeenCalled();
    });

    it('analyzes unanalyzed credit report documents and skips already-analyzed ones by default', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CREDIT_REPORT_EXPERIAN', fileName: 'experian.pdf', extractedData: null, fileUrl: '/uploads/experian.pdf', mimeType: 'application/pdf' },
                { id: 'd2', type: 'CREDIT_REPORT_XDS', fileName: 'xds.pdf', extractedData: '{"accounts":[]}', fileUrl: '/uploads/xds.pdf', mimeType: 'application/pdf' },
            ],
        } as never);
        vi.mocked(analyzeDocument)
            .mockResolvedValueOnce({ data: { accounts: [{ creditor: 'African Bank' }] } } as never) // detailed pass
            .mockResolvedValueOnce({ data: { totalDebt: 8467, totalInstallment: 450 } } as never); // summary-totals pass
        vi.mocked(prisma.document.update).mockResolvedValue({} as never);

        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.analyzed).toBe(1);
        expect(data.skipped).toBe(1);
        expect(analyzeDocument).toHaveBeenCalledTimes(2);
        expect(analyzeDocument).toHaveBeenNthCalledWith(1, expect.any(String), 'CREDIT_REPORT', 'application/pdf');
        expect(analyzeDocument).toHaveBeenNthCalledWith(2, expect.any(String), 'CREDIT_REPORT_SUMMARY', 'application/pdf');
        expect(prisma.document.update).toHaveBeenCalledWith({
            where: { id: 'd1' },
            data: {
                extractedData: JSON.stringify({
                    accounts: [{ creditor: 'African Bank' }],
                    summary: { totalDebt: 8467, totalInstallment: 450 },
                }),
                analyzedAt: expect.any(Date),
            },
        });
    });

    it('does not run the summary-totals pass for a non-major-bureau report type', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CLEAR_SCORE', fileName: 'clearscore.pdf', extractedData: null, fileUrl: '/uploads/clearscore.pdf', mimeType: 'application/pdf' },
            ],
        } as never);
        vi.mocked(analyzeDocument).mockResolvedValue({ data: { accounts: [] } } as never);
        vi.mocked(prisma.document.update).mockResolvedValue({} as never);

        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        expect(res.status).toBe(200);
        expect(analyzeDocument).toHaveBeenCalledTimes(1);
        expect(analyzeDocument).toHaveBeenCalledWith(expect.any(String), 'CREDIT_REPORT_OTHER', 'application/pdf');
    });

    it('keeps the detailed-pass totals when the summary-totals pass fails', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CREDIT_REPORT_EXPERIAN', fileName: 'experian.pdf', extractedData: null, fileUrl: '/uploads/experian.pdf', mimeType: 'application/pdf' },
            ],
        } as never);
        vi.mocked(analyzeDocument)
            .mockResolvedValueOnce({ data: { accounts: [], summary: { totalDebt: 100, totalInstallment: 10 } } } as never)
            .mockRejectedValueOnce(new Error('summary pass timed out'));
        vi.mocked(prisma.document.update).mockResolvedValue({} as never);

        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.analyzed).toBe(1);
        expect(prisma.document.update).toHaveBeenCalledWith({
            where: { id: 'd1' },
            data: {
                extractedData: JSON.stringify({ accounts: [], summary: { totalDebt: 100, totalInstallment: 10 } }),
                analyzedAt: expect.any(Date),
            },
        });
    });

    it('re-analyzes every credit report document when force is true', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CREDIT_REPORT_EXPERIAN', fileName: 'experian.pdf', extractedData: '{"accounts":[]}', fileUrl: '/uploads/experian.pdf', mimeType: 'application/pdf' },
            ],
        } as never);
        vi.mocked(analyzeDocument).mockResolvedValue({ data: { accounts: [] } } as never);
        vi.mocked(prisma.document.update).mockResolvedValue({} as never);

        const res = await POST(makeRequest({ force: true }), { params: Promise.resolve({ id: 'c1' }) });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.analyzed).toBe(1);
        expect(data.skipped).toBe(0);
    });

    it('records a per-document failure without aborting the rest of the batch', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                { id: 'd1', type: 'CREDIT_REPORT_EXPERIAN', fileName: 'experian.pdf', extractedData: null, fileUrl: '/uploads/experian.pdf', mimeType: 'application/pdf' },
                { id: 'd2', type: 'CREDIT_REPORT_XDS', fileName: 'xds.pdf', extractedData: null, fileUrl: '/uploads/xds.pdf', mimeType: 'application/pdf' },
            ],
        } as never);
        vi.mocked(analyzeDocument)
            .mockRejectedValueOnce(new Error('AI provider timeout')) // d1 detailed pass fails
            .mockResolvedValueOnce({ data: { accounts: [] } } as never) // d2 detailed pass succeeds
            .mockResolvedValueOnce({ data: {} } as never); // d2 summary-totals pass
        vi.mocked(prisma.document.update).mockResolvedValue({} as never);

        const res = await POST(makeRequest({}), { params: Promise.resolve({ id: 'c1' }) });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.analyzed).toBe(1);
        expect(data.failed).toBe(1);
        expect(data.results.find((r: any) => r.documentId === 'd1').success).toBe(false);
        expect(data.results.find((r: any) => r.documentId === 'd2').success).toBe(true);
    });
});
