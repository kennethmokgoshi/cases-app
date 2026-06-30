import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        debtCounsellor: { findUnique: vi.fn() },
        debtReviewRemovalConsent: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));

vi.mock('../notifications/service', () => ({
    sendManualMessage: vi.fn(),
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user'),
}));

import { prisma } from '@zenowethu/database';
import { sendManualMessage } from '../notifications/service';
import { handleDhsAccepted, isManageConsumersEligible } from './accepted-handler';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    debtCounsellor: { findUnique: ReturnType<typeof vi.fn> };
    debtReviewRemovalConsent: {
        findFirst: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    caseComment: { create: ReturnType<typeof vi.fn> };
};
const sendMsg = sendManualMessage as unknown as ReturnType<typeof vi.fn>;

const baseCase = {
    id: 'case1',
    clientId: 'cl1',
    fileNumber: 'ZDM-2026-001',
    client: { firstName: 'Sipho', email: 'sipho@example.com' },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.zenowethu.co.za';
    db.caseComment.create.mockResolvedValue({});
    db.case.update.mockResolvedValue({});
    db.debtReviewRemovalConsent.update.mockResolvedValue({});
});

describe('handleDhsAccepted', () => {
    it('creates a consent request and emails the consumer on first acceptance', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);
        db.debtReviewRemovalConsent.create.mockResolvedValue({
            id: 'consent1',
            token: 'tok123',
            expiresAt: new Date(Date.now() + 1e9),
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const r = await handleDhsAccepted({ caseId: 'case1', triggeredByUserId: 'staff1' });

        expect(r.emailSent).toBe(true);
        expect(r.skipped).toBe(false);
        expect(r.consentLink).toContain('/consent/debt-review-removal/tok123');
        // Email sent to the consumer with the consent link in the body
        const [, channel, recipient, body] = sendMsg.mock.calls[0];
        expect(channel).toBe('EMAIL');
        expect(recipient).toBe('sipho@example.com');
        expect(body).toContain('/consent/debt-review-removal/tok123');
        // Moves the case to "Ready to Consent" with a follow-up date
        expect(r.statusUpdatedTo).toBe('READY_TO_CONSENT');
        const upd = db.case.update.mock.calls.find((c) => c[0].data.status === 'READY_TO_CONSENT');
        expect(upd).toBeTruthy();
        expect(upd?.[0].data.nextUpdate).toBeInstanceOf(Date);
    });

    it('resolves the previous DC name from the DebtCounsellor master table by NCRDC', async () => {
        db.case.findUnique.mockResolvedValue({
            ...baseCase,
            ncrdcNo: 'NCRDC2439',
            debtCounsellorName: '',
            dcTradingName: '',
            previousDebtCounsellor: null,
        });
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);
        db.debtReviewRemovalConsent.create.mockResolvedValue({
            id: 'consent1', token: 'tok123', expiresAt: new Date(Date.now() + 1e9),
        });
        db.debtCounsellor.findUnique.mockResolvedValue({ fullName: null, tradingName: 'debtSolve' });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        await handleDhsAccepted({ caseId: 'case1' });

        expect(db.debtCounsellor.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { ncrdcNo: 'NCRDC2439' } })
        );
        const body = sendMsg.mock.calls[0][3];
        expect(body).toMatch(/from debtSolve to Zenowethu Debt Management/i);
    });

    it('is idempotent — skips the email but keeps the case parked at Ready to Consent (pending)', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue({
            id: 'consent1',
            token: 'existing',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 1e9),
        });

        const r = await handleDhsAccepted({ caseId: 'case1' });

        expect(r.skipped).toBe(true);
        expect(r.emailSent).toBe(false);
        expect(sendMsg).not.toHaveBeenCalled();
        expect(db.debtReviewRemovalConsent.create).not.toHaveBeenCalled();
        // Re-asserts the parked status so a re-check can't downgrade it
        expect(r.statusUpdatedTo).toBe('READY_TO_CONSENT');
        const upd = db.case.update.mock.calls.find((c) => c[0].data.status === 'READY_TO_CONSENT');
        expect(upd).toBeTruthy();
    });

    it('does not change status on skip when consent is already CONSENTED', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue({
            id: 'consent1',
            token: 'existing',
            status: 'CONSENTED',
            expiresAt: new Date(Date.now() + 1e9),
        });

        const r = await handleDhsAccepted({ caseId: 'case1' });

        expect(r.skipped).toBe(true);
        expect(r.statusUpdatedTo).toBeNull();
        expect(db.case.update).not.toHaveBeenCalled();
    });

    it('escalates (no email) when the consumer has no email on file', async () => {
        db.case.findUnique.mockResolvedValue({ ...baseCase, client: { firstName: 'Sipho', email: null } });
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);

        const r = await handleDhsAccepted({ caseId: 'case1' });

        expect(r.emailSent).toBe(false);
        expect(r.errors[0]).toContain('No consumer email');
        expect(sendMsg).not.toHaveBeenCalled();
        expect(db.caseComment.create).toHaveBeenCalled();
    });

    it('rolls back the consent request so a later check retries when the email fails', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);
        db.debtReviewRemovalConsent.create.mockResolvedValue({
            id: 'consent1',
            token: 'tok123',
            expiresAt: new Date(Date.now() + 1e9),
        });
        sendMsg.mockResolvedValue({ emailSuccess: false, errors: ['SMTP refused'] });

        const r = await handleDhsAccepted({ caseId: 'case1' });

        expect(r.emailSent).toBe(false);
        expect(r.errors).toContain('SMTP refused');
        const cancel = db.debtReviewRemovalConsent.update.mock.calls.find(
            (c) => c[0].data.status === 'CANCELLED'
        );
        expect(cancel).toBeTruthy();
    });

    it('returns an error (no throw) when the case is not found', async () => {
        db.case.findUnique.mockResolvedValue(null);
        const r = await handleDhsAccepted({ caseId: 'missing' });
        expect(r.errors).toContain('Case not found');
        expect(r.emailSent).toBe(false);
    });
});

describe('isManageConsumersEligible', () => {
    it('matches accepted workflow statuses (whitespace/underscore/case-insensitive)', () => {
        expect(isManageConsumersEligible({ status: 'ACCEPTED_VIA_DHS' })).toBe(true);
        expect(isManageConsumersEligible({ status: 'READY_TO_CONSENT' })).toBe(true);
        expect(isManageConsumersEligible({ status: 'accepted via dhs' })).toBe(true);
    });

    it('matches the DHS request-status labels', () => {
        expect(isManageConsumersEligible({ dhsStatus: 'Accepted' })).toBe(true);
        expect(isManageConsumersEligible({ dhsStatus: 'Auto Transferred' })).toBe(true);
    });

    it('is true when either status or dhsStatus qualifies', () => {
        expect(isManageConsumersEligible({ status: 'REQUESTED_VIA_DHS', dhsStatus: 'Accepted' })).toBe(true);
    });

    it('honors the manual "Accepted via DHS" staff override regardless of status', () => {
        expect(isManageConsumersEligible({ status: 'REQUESTED_VIA_DHS', dhsStatus: 'Pending', manuallyAcceptedViaDhs: true })).toBe(true);
        expect(isManageConsumersEligible({ manuallyAcceptedViaDhs: true })).toBe(true);
        expect(isManageConsumersEligible({ manuallyAcceptedViaDhs: false, status: 'PENDING' })).toBe(false);
    });

    it('rejects non-accepted / empty states', () => {
        expect(isManageConsumersEligible({ status: 'REQUESTED_VIA_DHS', dhsStatus: 'Pending' })).toBe(false);
        expect(isManageConsumersEligible({ status: 'DECLINED_VIA_DHS' })).toBe(false);
        expect(isManageConsumersEligible({ status: 'NOT_LINKED', dhsStatus: 'Not Requested via DHS' })).toBe(false);
        expect(isManageConsumersEligible({})).toBe(false);
        expect(isManageConsumersEligible({ status: null, dhsStatus: undefined })).toBe(false);
    });
});
