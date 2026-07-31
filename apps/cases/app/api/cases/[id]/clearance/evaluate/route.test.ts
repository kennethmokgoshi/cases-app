import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
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

describe('GET /api/cases/[id]/clearance/evaluate', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(auth).mockResolvedValue(session as never);
    });

    it('returns 401 if unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/cases/c1/clearance/evaluate') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });
        expect(res.status).toBe(401);
    });

    it('recommends FORM_19_F2 when all debts are settled/paid up', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            status: 'ACCEPTED_VIA_DHS',
            dhsStatus: 'Accepted',
            manuallyAcceptedViaDhs: false,
            client: { firstName: 'Benneth', lastName: 'Rikhotso' },
            documents: [{ documentType: 'CREDIT_REPORT' }],
            creditAccounts: [
                { id: 'a1', creditorName: 'Cell C', balance: 0, status: 'PAID_UP', accountType: 'OPEN_SERVICES' },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/clearance/evaluate') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.eligible).toBe(true);
        expect(data.hasCreditReport).toBe(true);
        expect(data.recommendedForm).toBe('FORM_19_F2');
        expect(data.targetStatus).toBe('F2');
    });

    it('recommends FORM_19_F1 when only a mortgage bond remains active', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            status: 'ACCEPTED_VIA_DHS',
            dhsStatus: 'D4',
            manuallyAcceptedViaDhs: false,
            client: { firstName: 'Benneth', lastName: 'Rikhotso' },
            documents: [{ documentType: 'XDS_REPORT' }],
            creditAccounts: [
                { id: 'a1', creditorName: 'Cell C', balance: 0, status: 'PAID_UP', accountType: 'OPEN_SERVICES' },
                { id: 'a2', creditorName: 'SA Home Loans', balance: 450000, status: 'OPEN', accountType: 'MORTGAGE' },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/clearance/evaluate') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.recommendedForm).toBe('FORM_19_F1');
        expect(data.targetStatus).toBe('F1');
    });

    it('recommends FORM_17_W when unsecured debts remain active', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValue({
            id: 'c1',
            status: 'ACCEPTED_FORM_177',
            dhsStatus: 'A',
            manuallyAcceptedViaDhs: false,
            client: { firstName: 'Benneth', lastName: 'Rikhotso' },
            documents: [{ documentType: 'CREDIT_REPORT' }],
            creditAccounts: [
                { id: 'a1', creditorName: 'African Bank', balance: 8467, status: 'OPEN', accountType: 'PERSONAL_LOAN' },
            ],
        } as never);

        const res = await GET(new Request('http://localhost/api/cases/c1/clearance/evaluate') as never, {
            params: Promise.resolve({ id: 'c1' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.recommendedForm).toBe('FORM_17_W');
        expect(data.accountsSummary.openCount).toBe(1);
    });
});
