import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        creditAccount: { create: vi.fn(), update: vi.fn() },
        workflowLog: { create: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET, POST } from './route';

const session = { user: { id: 'user-1', email: 'staff@example.com' } };

describe('GET /api/cases/[id]/credit-accounts/sync', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(auth).mockResolvedValue(session as never);
    });

    it('returns 401 if unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/cases/c1/credit-accounts/sync') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 404 when the case does not exist', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/cases/c1/credit-accounts/sync') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        expect(res.status).toBe(404);
    });

    it('flags unanalyzed credit report documents and returns no candidates for them', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [{ id: 'doc-1', type: 'CREDIT_REPORT_EXPERIAN', fileName: 'report.pdf', extractedData: null }],
            creditAccounts: [],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/credit-accounts/sync') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.needsAnalysis).toHaveLength(1);
        expect(data.candidates).toHaveLength(0);
    });

    it('extracts candidate accounts from an analyzed credit report and dedupes against existing accounts', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                {
                    id: 'doc-1',
                    type: 'CREDIT_REPORT_EXPERIAN',
                    fileName: 'report.pdf',
                    extractedData: JSON.stringify({
                        accounts: [
                            { creditor: 'African Bank', accountNumber: '999888', balance: 8467, status: 'Current' },
                            { creditor: 'Edgars', accountNumber: '12345', balance: 1840, status: 'Prescribed' },
                        ],
                    }),
                },
            ],
            creditAccounts: [{ id: 'existing-1', creditorName: 'Edgars', accountNumber: '12345' }],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/credit-accounts/sync') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.candidates).toHaveLength(2);
        const africanBank = data.candidates.find((c: any) => c.creditorName === 'African Bank');
        const edgars = data.candidates.find((c: any) => c.creditorName === 'Edgars');
        expect(africanBank.matchStatus).toBe('NEW');
        expect(edgars.matchStatus).toBe('DUPLICATE');
        expect(edgars.existingAccountId).toBe('existing-1');
    });

    it('includes adverseListings candidates even when accounts is empty — this is where written-off debt often lives', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            documents: [
                {
                    id: 'doc-1',
                    type: 'CREDIT_REPORT_EXPERIAN',
                    fileName: 'report.pdf',
                    extractedData: JSON.stringify({
                        accounts: [],
                        adverseListings: [
                            {
                                creditor: 'LEWIS STORES',
                                accountNumber: '0903150',
                                adverseCode: 'Written Off',
                                openBalance: 33330,
                                overdueBalance: 33330,
                                lastPaymentDate: '2024-11-07',
                                status: 'WRITTEN OFF',
                            },
                        ],
                    }),
                },
            ],
            creditAccounts: [],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/credit-accounts/sync') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.candidates).toHaveLength(1);
        expect(data.candidates[0].creditorName).toBe('LEWIS STORES');
        expect(data.candidates[0].outstandingBalance).toBe(33330);
        expect(data.candidates[0].status).toBe('WRITTEN OFF');
        expect(data.candidates[0].matchStatus).toBe('NEW');
    });
});

describe('POST /api/cases/[id]/credit-accounts/sync', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(auth).mockResolvedValue(session as never);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ id: 'c1', clientId: 'client-1' } as never);
        vi.mocked(prisma.creditAccount.create).mockResolvedValue({ id: 'new-1' } as never);
        vi.mocked(prisma.creditAccount.update).mockResolvedValue({ id: 'existing-1' } as never);
        vi.mocked(prisma.workflowLog.create).mockResolvedValue({} as never);
    });

    it('returns 401 if unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(
            new Request('http://localhost/api/cases/c1/credit-accounts/sync', { method: 'POST', body: '{}' }) as never,
            { params: Promise.resolve({ id: 'c1' }) }
        );
        expect(res.status).toBe(401);
    });

    it('creates new accounts and updates matched existing ones', async () => {
        const res = await POST(
            new Request('http://localhost/api/cases/c1/credit-accounts/sync', {
                method: 'POST',
                body: JSON.stringify({
                    accounts: [
                        {
                            include: true,
                            creditorName: 'African Bank',
                            accountNumber: '999888',
                            accountType: 'Personal Loan',
                            outstandingBalance: 8467,
                            status: 'ACTIVE',
                            existingAccountId: null,
                        },
                        {
                            include: true,
                            creditorName: 'Edgars',
                            accountNumber: '12345',
                            accountType: 'Retail',
                            outstandingBalance: 1840,
                            status: 'PRESCRIBED',
                            existingAccountId: 'existing-1',
                        },
                    ],
                }),
            }) as never,
            { params: Promise.resolve({ id: 'c1' }) }
        );

        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.created).toBe(1);
        expect(data.updated).toBe(1);
        expect(prisma.creditAccount.create).toHaveBeenCalledTimes(1);
        expect(prisma.creditAccount.update).toHaveBeenCalledTimes(1);
        expect(prisma.workflowLog.create).toHaveBeenCalledTimes(1);
    });

    it('rejects when no accounts are marked as included', async () => {
        const res = await POST(
            new Request('http://localhost/api/cases/c1/credit-accounts/sync', {
                method: 'POST',
                body: JSON.stringify({
                    accounts: [
                        {
                            include: false,
                            creditorName: 'African Bank',
                            accountType: 'Other',
                            outstandingBalance: 100,
                            status: 'ACTIVE',
                        },
                    ],
                }),
            }) as never,
            { params: Promise.resolve({ id: 'c1' }) }
        );
        expect(res.status).toBe(422);
    });
});
