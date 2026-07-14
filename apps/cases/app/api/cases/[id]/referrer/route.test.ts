import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
    auth: vi.fn(),
    getCommissionStageForCaseStatus: vi.fn((status: string) => (status === 'SETTLED' ? 'SETTLED' : null)),
    isCommissionEligible: vi.fn(() => true),
    calculateCommissionAmount: vi.fn(() => 200),
    referrerEarnsCommission: vi.fn((type: string | null | undefined) => type !== 'DISCOUNT'),
}));

vi.mock('@/lib/referrer-access', () => ({
    hasFullReferrerVisibility: vi.fn(() => true),
    canAccessReferrer: vi.fn(async () => true),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
        referrer: { findUnique: vi.fn() },
        referrerCommission: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn(), update: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));

import { PATCH } from './route';
import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { hasFullReferrerVisibility, canAccessReferrer } from '@/lib/referrer-access';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    referrer: { findUnique: ReturnType<typeof vi.fn> };
    referrerCommission: {
        findUnique: ReturnType<typeof vi.fn>;
        upsert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    caseComment: { create: ReturnType<typeof vi.fn> };
};

const params = Promise.resolve({ id: 'case1' });
const request = (body: unknown) =>
    new Request('https://app.zenowethu.co.za/api/cases/case1/referrer', {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const adminSession = { user: { id: 'staff1', isAdmin: true } };

const baseCase = {
    id: 'case1',
    status: 'SETTLED',
    referrerId: null,
    referrer: null,
};

const williamReferrer = {
    id: 'ref-william',
    firstName: 'William',
    lastName: 'Maesela',
    email: null,
    cellNumber: '0820000000',
    referrerType: 'COMMISSION',
    isActive: true,
    projectId: 'proj-william',
    commissionType: 'FIXED',
    fixedCommissionAmount: 200,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(hasFullReferrerVisibility).mockReturnValue(true);
    vi.mocked(canAccessReferrer).mockResolvedValue(true);
    db.case.findUnique.mockResolvedValue(baseCase);
    db.case.update.mockResolvedValue({});
    db.case.count.mockResolvedValue(1);
    db.referrer.findUnique.mockResolvedValue(williamReferrer);
    db.referrerCommission.findUnique.mockResolvedValue(null);
    db.caseComment.create.mockResolvedValue({});
});

describe('PATCH /api/cases/[id]/referrer', () => {
    it('rejects unauthenticated callers', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        expect((await PATCH(request({ referrerId: 'ref-william' }), { params })).status).toBe(401);
        expect(db.case.update).not.toHaveBeenCalled();
    });

    it('rejects staff below manager level', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'staff2', role: 'MEMBER' } } as never);
        expect((await PATCH(request({ referrerId: 'ref-william' }), { params })).status).toBe(403);
    });

    it('404s when the case does not exist', async () => {
        db.case.findUnique.mockResolvedValue(null);
        expect((await PATCH(request({ referrerId: 'ref-william' }), { params })).status).toBe(404);
    });

    it('404s when the referrer does not exist', async () => {
        db.referrer.findUnique.mockResolvedValue(null);
        expect((await PATCH(request({ referrerId: 'ghost' }), { params })).status).toBe(404);
    });

    it('refuses to assign an inactive referrer', async () => {
        db.referrer.findUnique.mockResolvedValue({ ...williamReferrer, isActive: false });
        expect((await PATCH(request({ referrerId: 'ref-william' }), { params })).status).toBe(422);
        expect(db.case.update).not.toHaveBeenCalled();
    });

    it('rejects non-admins assigning a referrer outside their project membership', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'mgr1', role: 'MANAGER' } } as never);
        vi.mocked(hasFullReferrerVisibility).mockReturnValue(false);
        vi.mocked(canAccessReferrer).mockResolvedValue(false);
        expect((await PATCH(request({ referrerId: 'ref-william' }), { params })).status).toBe(403);
    });

    it('blocks reassignment when the commission was already paid out', async () => {
        db.referrerCommission.findUnique.mockResolvedValue({ isPaid: true });
        const res = await PATCH(request({ referrerId: 'ref-william' }), { params });
        expect(res.status).toBe(409);
        expect(db.case.update).not.toHaveBeenCalled();
    });

    it('assigns a referrer, syncs the commission to the current case stage, and logs a timeline comment', async () => {
        const res = await PATCH(request({ referrerId: 'ref-william' }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.referrer).toEqual(
            expect.objectContaining({ id: 'ref-william', firstName: 'William', lastName: 'Maesela' })
        );
        expect(db.case.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'case1' },
                data: expect.objectContaining({ referrer: { connect: { id: 'ref-william' } } }),
            })
        );
        expect(db.referrerCommission.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { caseId: 'case1' },
                create: expect.objectContaining({ referrerId: 'ref-william', stage: 'SETTLED', isEligible: true, commissionAmount: 200 }),
                update: expect.objectContaining({ referrerId: 'ref-william', stage: 'SETTLED', isEligible: true, commissionAmount: 200 }),
            })
        );
        expect(db.caseComment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    caseId: 'case1',
                    activityType: 'REFERRER_CHANGE',
                    content: expect.stringContaining('William Maesela'),
                }),
            })
        );
    });

    it('removes the referrer and deletes the unpaid commission row', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            referrerId: 'ref-old',
            referrer: { id: 'ref-old', firstName: 'Old', lastName: 'Referrer' },
        });
        db.referrerCommission.findUnique.mockResolvedValue({ isPaid: false });

        const res = await PATCH(request({ referrerId: null }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.referrer).toBeNull();
        expect(db.case.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ referrer: { disconnect: true } }) })
        );
        expect(db.referrerCommission.delete).toHaveBeenCalledWith({ where: { caseId: 'case1' } });
        expect(db.caseComment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ content: expect.stringContaining('Removed referrer') }),
            })
        );
    });

    it('no-ops when the requested referrer is already assigned', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            referrerId: 'ref-william',
            referrer: { id: 'ref-william', firstName: 'William', lastName: 'Maesela' },
        });

        const res = await PATCH(request({ referrerId: 'ref-william' }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.unchanged).toBe(true);
        expect(db.case.update).not.toHaveBeenCalled();
        expect(db.caseComment.create).not.toHaveBeenCalled();
    });
});
