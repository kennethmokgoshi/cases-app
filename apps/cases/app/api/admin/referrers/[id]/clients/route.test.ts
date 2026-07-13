import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        referrer: { findUnique: vi.fn() },
        case: { findMany: vi.fn() },
        projectMember: { findMany: vi.fn() },
        project: { findMany: vi.fn() },
    },
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const mockAdmin = { user: { id: 'u1', isAdmin: true, isExecutive: false, isSeniorManager: false, role: 'ADMIN' } };
const mockManager = { user: { id: 'u2', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MANAGER' } };
const mockMember = { user: { id: 'u3', isAdmin: false, isExecutive: false, isSeniorManager: false, role: 'MEMBER' } };

const sampleReferrer = {
    id: 'ref-1',
    firstName: 'John',
    lastName: 'Doe',
    isActive: true,
    cellNumber: '082 000 0000',
    email: 'john@x.co.za',
    commissionType: 'FIXED',
    fixedCommissionAmount: 300,
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'John Doe' },
};

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const sampleCases = [
    {
        id: 'case-1',
        fileNumber: 'F001',
        status: 'NEW_CASE',
        createdAt: now,
        updatedAt: now,
        nextUpdate: yesterday, // overdue
        serviceFee: null,
        updatedBy: { firstName: 'Sipho', lastName: 'K' },
        client: { id: 'cl-1', firstName: 'Thabo', lastName: 'M', idNumber: '9001015800081', phone: '083', email: 't@z.co.za' },
        payments: [{ amount: 2250, status: 'COMPLETED' }],
        invoices: [{ total: 4500, status: 'ACCEPTED', type: 'QUOTE', acceptedAt: now }],
        referrerCommission: { stage: 'DEPOSIT_PAID', isEligible: true, isPaid: false, commissionAmount: 300, paidAt: null },
    },
    {
        id: 'case-2',
        fileNumber: 'F002',
        status: 'SETTLED',
        createdAt: new Date(now.getFullYear(), now.getMonth() - 2, 15),
        updatedAt: now,
        nextUpdate: tomorrow,
        serviceFee: 3000,
        updatedBy: null,
        client: { id: 'cl-2', firstName: 'Lerato', lastName: 'A', idNumber: '8501015800082', phone: null, email: null },
        payments: [{ amount: 3000, status: 'COMPLETED' }],
        invoices: [],
        referrerCommission: { stage: 'SETTLED', isEligible: true, isPaid: true, commissionAmount: 300, paidAt: now },
    },
    {
        id: 'case-3',
        fileNumber: 'F003',
        status: 'AWAITING_DOCS',
        createdAt: now,
        updatedAt: now,
        nextUpdate: null,
        serviceFee: null,
        updatedBy: null,
        client: { id: 'cl-2', firstName: 'Lerato', lastName: 'A', idNumber: '8501015800082', phone: null, email: null },
        payments: [],
        invoices: [],
        referrerCommission: null,
    },
];

function makeReq() {
    return new Request('http://localhost/api/admin/referrers/ref-1/clients');
}
const routeParams = { params: Promise.resolve({ id: 'ref-1' }) };

describe('GET /api/admin/referrers/[id]/clients', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(401);
    });

    it('returns 403 for a plain member role', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockMember as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(403);
    });

    it('returns 404 when referrer not found', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(null);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(404);
    });

    it('returns 403 for a manager who is not a member of this referrer', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([] as never);
        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(403);
    });

    it('returns clients, summary, stage breakdown and trend for admin', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockAdmin as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.case.findMany).mockResolvedValueOnce(sampleCases as never);

        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.referrer.id).toBe('ref-1');
        expect(json.clients).toHaveLength(3);

        // cl-2 has two cases but counts once as a client
        expect(json.summary.totalClients).toBe(2);
        expect(json.summary.totalCases).toBe(3);
        expect(json.summary.settled).toBe(1);
        expect(json.summary.eligible).toBe(2);
        expect(json.summary.paid).toBe(1);
        expect(json.summary.unpaidEligible).toBe(1);
        expect(json.summary.totalOwed).toBe(300);
        expect(json.summary.totalPaid).toBe(300);
        expect(json.summary.conversionRate).toBe(67); // 2 of 3 cases eligible
        expect(json.summary.newThisMonth).toBe(2);

        // case without a commission record lands in NO_RECORD
        const noRecord = json.stageBreakdown.find((s: { stage: string }) => s.stage === 'NO_RECORD');
        expect(noRecord.count).toBe(1);

        // tracking fields: last update by + next update
        const case1 = json.clients.find((c: { caseId: string }) => c.caseId === 'case-1');
        expect(case1.lastUpdatedBy).toBe('Sipho K');
        expect(case1.nextUpdate).toBeTruthy();
        expect(json.summary.updatesOverdue).toBe(1); // only case-1's nextUpdate is in the past

        // per-case financials: accepted quote R4,500 with R2,250 collected
        expect(case1.financials.quoteTotal).toBe(4500);
        expect(case1.financials.quoteSource).toBe('ACCEPTED_QUOTE');
        expect(case1.financials.totalPaid).toBe(2250);
        expect(case1.financials.balance).toBe(2250);
        expect(case1.financials.percentCollected).toBe(50);

        // case-2 uses its service fee as the quote basis and is fully collected
        const case2 = json.clients.find((c: { caseId: string }) => c.caseId === 'case-2');
        expect(case2.financials.quoteSource).toBe('CASE_SERVICE_FEE');
        expect(case2.financials.balance).toBe(0);

        // rolled-up money: R4,500 quote + R3,000 fee; R5,250 collected; R2,250 due
        expect(json.summary.totalQuoted).toBe(7500);
        expect(json.summary.totalCollected).toBe(5250);
        expect(json.summary.totalBalanceDue).toBe(2250);

        expect(json.monthlyTrend).toHaveLength(6);
        expect(json.monthlyTrend[5].count).toBe(2); // current month
        expect(json.monthlyTrend[3].count).toBe(1); // two months ago
    });

    it('allows a manager who is a member of the referrer sub-project', async () => {
        vi.mocked(auth).mockResolvedValueOnce(mockManager as never);
        vi.mocked(prisma.referrer.findUnique).mockResolvedValueOnce(sampleReferrer as never);
        vi.mocked(prisma.projectMember.findMany).mockResolvedValueOnce([{ projectId: 'proj-1' }] as never);
        vi.mocked(prisma.project.findMany).mockResolvedValueOnce([{ id: 'proj-1', parentId: null }] as never);
        vi.mocked(prisma.case.findMany).mockResolvedValueOnce([] as never);

        const res = await GET(makeReq(), routeParams);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.summary.totalClients).toBe(0);
        expect(json.summary.conversionRate).toBe(0);
    });
});
