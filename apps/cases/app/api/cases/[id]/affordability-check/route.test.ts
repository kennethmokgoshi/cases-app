import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/shared-lib', () => ({
    auth:         vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
    },
}));

import { auth }   from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';

import { GET } from './route';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const staffSession = { user: { id: 'u1', isAdmin: true } };

function ctx(caseId: string) {
    return { params: Promise.resolve({ id: caseId }) };
}

const req = new Request('http://localhost/api/cases/case-1/affordability-check');

const baseCase = {
    id:         'case-1',
    fileNumber: 'ZW-0001',
    dhsStatus:  'A',
    client:     { netSalary: null },
    creditAccounts: [
        {
            id: 'acc-1', creditorName: 'FNB', accountNumber: '123', accountType: 'CREDIT_CARD',
            accountOpenDate: new Date('2020-01-15T00:00:00.000Z'),
            status: 'ACTIVE', outstandingBalance: 50000, monthlyInstalment: 2500, isIncluded: true,
            lastPaymentDate: new Date('2026-06-25T00:00:00.000Z'),
            updatedAt: new Date('2026-07-01T10:30:00.000Z'),
            creditProvider: { name: 'First National Bank' },
        },
        {
            id: 'acc-2', creditorName: 'ABSA', accountNumber: '456', accountType: 'PERSONAL_LOAN',
            accountOpenDate: null,
            status: 'ACTIVE', outstandingBalance: 30000, monthlyInstalment: 1500, isIncluded: true,
            lastPaymentDate: null,
            updatedAt: new Date('2026-07-02T10:30:00.000Z'),
            creditProvider: null,
        },
        {
            id: 'acc-3', creditorName: 'Closed Retail', accountNumber: '789', accountType: 'RETAIL',
            accountOpenDate: null,
            status: 'CLOSED', outstandingBalance: 0, monthlyInstalment: null, isIncluded: false,
            lastPaymentDate: null,
            updatedAt: new Date('2026-07-03T10:30:00.000Z'),
            creditProvider: null,
        },
    ],
    documents: [
        { type: 'PAYSLIP',        extractedData: JSON.stringify({ netSalary: 18000 }) },
        { type: 'BANK_STATEMENT', extractedData: JSON.stringify({ latestSalaryDeposit: { amount: 17950, date: '2026-06-25' } }) },
    ],
};

beforeEach(() => vi.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/cases/[id]/affordability-check', () => {
    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as any);
        const res = await GET(req, ctx('case-1') as any);
        expect(res.status).toBe(401);
    });

    it('returns 404 when the case does not exist', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(null as any);
        const res = await GET(req, ctx('missing') as any);
        expect(res.status).toBe(404);
    });

    it('returns the credit report summary, verified income and rejection recommendation', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(baseCase as any);

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.summary).toEqual({
            openAccounts:            2,
            closedAccounts:          1,
            totalOutstandingBalance: 80000,
            totalMonthlyInstalment:  4000,
        });
        expect(json.openAccountRows).toEqual([
            expect.objectContaining({
                id: 'acc-1',
                creditorName: 'FNB',
                providerName: 'First National Bank',
                accountNumber: '123',
                accountType: 'CREDIT_CARD',
                openDate: '2020-01-15T00:00:00.000Z',
                balance: 50000,
                monthlyInstalment: 2500,
                lastPaymentDate: '2026-06-25T00:00:00.000Z',
                lastUpdate: '2026-07-01T10:30:00.000Z',
            }),
            expect.objectContaining({ id: 'acc-2', creditorName: 'ABSA' }),
        ]);
        expect(json.income.payslipNetIncome).toBe(18000);
        expect(json.income.bankConfirmed).toBe(true);
        expect(json.isAffordable).toBe(true);
        expect(json.monthlySurplus).toBe(14000);
        expect(json.isDhsStatusA).toBe(true);
        expect(json.rejectionRecommended).toBe(true);
        expect(json.requiredDocuments).toEqual([
            'FORM_16', 'FORM_17_2A', 'AFFORDABILITY_ASSESSMENT', 'CONSUMER_INFO_RECORD',
        ]);
    });

    it('does not recommend rejection when instalments exceed income', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            ...baseCase,
            creditAccounts: [
                { ...baseCase.creditAccounts[0], outstandingBalance: 500000, monthlyInstalment: 25000 },
            ],
        } as any);

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(json.isAffordable).toBe(false);
        expect(json.rejectionRecommended).toBe(false);
        expect(json.requiredDocuments).toEqual([]);
    });

    it('flags DHS Status C and returns the rescission pack document list', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ ...baseCase, dhsStatus: 'C' } as any);

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(json.isDhsStatusA).toBe(false);
        expect(json.isDhsStatusC).toBe(true);
        expect(json.rescissionDocuments).toEqual([
            'NOTICE_OF_MOTION', 'FOUNDING_AFFIDAVIT', 'NOTICE_OF_SET_DOWN',
            'NOTICE_OF_MOTION_RESCISSION', 'COURT_ORDER_GRANTED', 'PROOF_OF_SERVICE',
        ]);
    });

    it('returns an empty rescission list for non-C statuses', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(baseCase as any); // dhsStatus 'A'

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(json.isDhsStatusC).toBe(false);
        expect(json.rescissionDocuments).toEqual([]);
    });

    it('flags DHS Status D3 as a rescission path to G', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ ...baseCase, dhsStatus: 'D3' } as any);

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(json.isDhsStatusD3).toBe(true);
        expect(json.rescissionDocuments).toEqual([
            'NOTICE_OF_MOTION', 'FOUNDING_AFFIDAVIT', 'NOTICE_OF_SET_DOWN',
            'NOTICE_OF_MOTION_RESCISSION', 'COURT_ORDER_GRANTED', 'PROOF_OF_SERVICE',
        ]);
    });

    it('flags DHS Status D4 and returns the D4 generated document packs', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({ ...baseCase, dhsStatus: 'D4' } as any);

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(json.isDhsStatusD4).toBe(true);
        expect(json.d4F1GeneratedDocuments).toEqual([
            'CERTIFIED_FORM_19', 'FORM_17_2C',
            'DEBT_RESTRUCTURING_PROPOSAL', 'SECTION_71_72_STATEMENT',
        ]);
        expect(json.d4F2GeneratedDocuments).toEqual(['CERTIFIED_FORM_19']);
        expect(json.rescissionDocuments).toContain('NOTICE_OF_MOTION');
    });

    it('returns a null verdict when no income information exists', async () => {
        vi.mocked(auth).mockResolvedValue(staffSession as any);
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            ...baseCase,
            documents: [],
        } as any);

        const res  = await GET(req, ctx('case-1') as any);
        const json = await res.json();

        expect(json.isAffordable).toBeNull();
        expect(json.rejectionRecommended).toBe(false);
    });
});
