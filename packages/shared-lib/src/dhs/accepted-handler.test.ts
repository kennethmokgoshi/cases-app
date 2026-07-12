import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn(), update: vi.fn() },
        debtCounsellor: { findUnique: vi.fn() },
        debtReviewRemovalConsent: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        caseComment: { create: vi.fn() },
        consumerAccount: { findUnique: vi.fn() },
    },
}));

vi.mock('../notifications/service', () => ({
    sendManualMessage: vi.fn(),
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user'),
}));

vi.mock('../credo/consumer-provisioning', () => ({
    provisionConsumerForClient: vi.fn(),
    createPasswordResetTokenForConsumer: vi.fn(),
}));

import { prisma } from '@zenowethu/database';
import { sendManualMessage } from '../notifications/service';
import {
    provisionConsumerForClient,
    createPasswordResetTokenForConsumer,
} from '../credo/consumer-provisioning';
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
    consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
};
const sendMsg = sendManualMessage as unknown as ReturnType<typeof vi.fn>;
const provision = provisionConsumerForClient as unknown as ReturnType<typeof vi.fn>;
const createResetToken = createPasswordResetTokenForConsumer as unknown as ReturnType<typeof vi.fn>;

const baseCase = {
    id: 'case1',
    clientId: 'cl1',
    fileNumber: 'ZDM-2026-001',
    client: { firstName: 'Sipho', email: 'sipho@example.com', idNumber: '8001015009087' },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.zenowethu.co.za';
    process.env.CREDO_URL = 'https://credo.zenowethu.co.za';
    db.caseComment.create.mockResolvedValue({});
    db.case.update.mockResolvedValue({});
    db.debtReviewRemovalConsent.update.mockResolvedValue({});
    // Default: Credo profile exists and is already activated (has a password).
    provision.mockResolvedValue({ consumerId: 'cons1', created: false, activationToken: null });
    db.consumerAccount.findUnique.mockResolvedValue({ password: 'hashed' });
    createResetToken.mockResolvedValue('fresh-token');
});

describe('handleDhsAccepted', () => {
    it('provisions a Credo profile and emails the Credo consent link with login instructions', async () => {
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
        // The consent link is the login-gated Credo page, not the public token page
        expect(r.consentLink).toBe('https://credo.zenowethu.co.za/consent/tok123');
        // Consent is tied to the Credo profile
        expect(provision).toHaveBeenCalledWith('cl1');
        const createData = db.debtReviewRemovalConsent.create.mock.calls[0][0].data;
        expect(createData.consumerId).toBe('cons1');
        expect(createData.channel).toBe('CREDO');
        // Email sent to the consumer with the Credo link + ID-number login instructions
        const [, channel, recipient, body] = sendMsg.mock.calls[0];
        expect(channel).toBe('EMAIL');
        expect(recipient).toBe('sipho@example.com');
        expect(body).toContain('https://credo.zenowethu.co.za/consent/tok123');
        expect(body).toContain('ID number to type:  8001015009087');
        // Moves the case to "Ready to Consent" with a follow-up date
        expect(r.statusUpdatedTo).toBe('READY_TO_CONSENT');
        const upd = db.case.update.mock.calls.find((c) => c[0].data.status === 'READY_TO_CONSENT');
        expect(upd).toBeTruthy();
        expect(upd?.[0].data.nextUpdate).toBeInstanceOf(Date);
    });

    it('provisions a reset token when the Credo profile has never been activated', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);
        db.debtReviewRemovalConsent.create.mockResolvedValue({
            id: 'consent1', token: 'tok123', expiresAt: new Date(Date.now() + 1e9),
        });
        // Existing profile, but no password yet → a fresh activation token is issued
        provision.mockResolvedValue({ consumerId: 'cons1', created: false, activationToken: null });
        db.consumerAccount.findUnique.mockResolvedValue({ password: null });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        await handleDhsAccepted({ caseId: 'case1' });

        expect(createResetToken).toHaveBeenCalledWith('cons1');
        const body = sendMsg.mock.calls[0][3];
        // Password/reset link is no longer included in the email as consumers verify via ID number directly,
        // so we check that the email still contains the standard verification instructions.
        expect(body).toContain('ID number to type:  8001015009087');
    });

    it('falls back to the public consent link when no Credo profile can be provisioned', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);
        db.debtReviewRemovalConsent.create.mockResolvedValue({
            id: 'consent1', token: 'tok123', expiresAt: new Date(Date.now() + 1e9),
        });
        provision.mockResolvedValue(null); // e.g. client has no valid 13-digit ID number
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const r = await handleDhsAccepted({ caseId: 'case1' });

        expect(r.emailSent).toBe(true);
        expect(r.consentLink).toBe('https://cases.zenowethu.co.za/consent/debt-review-removal/tok123');
        const createData = db.debtReviewRemovalConsent.create.mock.calls[0][0].data;
        expect(createData.channel).toBe('EMAIL');
        const body = sendMsg.mock.calls[0][3];
        expect(body).toContain('/consent/debt-review-removal/tok123');
        expect(body).not.toContain('HOW TO LOG IN TO YOUR CREDO PORTAL');
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

    it('forceResend re-sends the email on a PENDING consent, reusing the existing token', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue({
            id: 'consent1',
            token: 'existing-tok',
            status: 'PENDING',
            channel: 'EMAIL', // originally sent before the Credo profile existed
            consumerId: null,
            expiresAt: new Date(Date.now() + 1e9),
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        const r = await handleDhsAccepted({ caseId: 'case1', triggeredByUserId: 'staff1', forceResend: true });

        expect(r.emailSent).toBe(true);
        expect(r.skipped).toBe(false);
        // Existing token reused — no new consent row
        expect(db.debtReviewRemovalConsent.create).not.toHaveBeenCalled();
        expect(r.consentLink).toBe('https://credo.zenowethu.co.za/consent/existing-tok');
        const body = sendMsg.mock.calls[0][3];
        expect(body).toContain('/consent/existing-tok');
        // Consent row upgraded to the Credo channel now that a profile exists
        const channelSync = db.debtReviewRemovalConsent.update.mock.calls.find(
            (c) => c[0].data.channel === 'CREDO'
        );
        expect(channelSync?.[0].data.consumerId).toBe('cons1');
        // Timeline comment reflects a RESEND, not a first send
        const comment = db.caseComment.create.mock.calls.find((c) => c[0].data.content.includes('RE-SENT'));
        expect(comment).toBeTruthy();
        // A resend uses the consent REMINDER wording — NOT the acceptance email.
        const sentBody = sendMsg.mock.calls[0][3];
        const sentSubject = sendMsg.mock.calls[0][4];
        expect(sentSubject).toContain('Reminder: Your Consent Is Needed');
        expect(sentBody).toContain('cannot continue');
        expect(sentBody).toContain('https://credo.zenowethu.co.za/consent/existing-tok');
        expect(sentBody).not.toContain('has been accepted');
    });

    it('first send (no forceResend) still uses the "Good News" acceptance wording', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue(null);
        db.debtReviewRemovalConsent.create.mockResolvedValue({
            id: 'consent1', token: 'tok123', expiresAt: new Date(Date.now() + 1e9),
        });
        sendMsg.mockResolvedValue({ emailSuccess: true, errors: [] });

        await handleDhsAccepted({ caseId: 'case1', triggeredByUserId: 'staff1' });

        const sentBody = sendMsg.mock.calls[0][3];
        const sentSubject = sendMsg.mock.calls[0][4];
        expect(sentSubject).toContain('Good News');
        expect(sentBody).toContain('has been accepted');
    });

    it('forceResend never re-emails a consumer who has already consented', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue({
            id: 'consent1',
            token: 'existing-tok',
            status: 'CONSENTED',
            channel: 'CREDO',
            expiresAt: new Date(Date.now() + 1e9),
        });

        const r = await handleDhsAccepted({ caseId: 'case1', forceResend: true });

        expect(r.skipped).toBe(true);
        expect(r.emailSent).toBe(false);
        expect(r.reason).toBe('Consumer has already consented');
        expect(sendMsg).not.toHaveBeenCalled();
    });

    it('a failed resend leaves the existing consent token alive (no CANCELLED rollback)', async () => {
        db.case.findUnique.mockResolvedValue(baseCase);
        db.debtReviewRemovalConsent.findFirst.mockResolvedValue({
            id: 'consent1',
            token: 'existing-tok',
            status: 'PENDING',
            channel: 'CREDO',
            consumerId: 'cons1',
            expiresAt: new Date(Date.now() + 1e9),
        });
        sendMsg.mockResolvedValue({ emailSuccess: false, errors: ['SMTP refused'] });

        const r = await handleDhsAccepted({ caseId: 'case1', forceResend: true });

        expect(r.emailSent).toBe(false);
        expect(r.errors).toContain('SMTP refused');
        const cancel = db.debtReviewRemovalConsent.update.mock.calls.find(
            (c) => c[0].data.status === 'CANCELLED'
        );
        expect(cancel).toBeFalsy();
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

    it('treats a ZDM Client file as eligible — already under our own NCRDC, no transfer needed', () => {
        expect(isManageConsumersEligible({ status: 'ZDM_CLIENT' })).toBe(true);
        expect(isManageConsumersEligible({ dhsStatus: 'ZDM Client' })).toBe(true);
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
