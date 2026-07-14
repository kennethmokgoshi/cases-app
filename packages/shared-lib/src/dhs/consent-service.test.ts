import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        debtReviewRemovalConsent: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        case: { update: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));

vi.mock('../automation/automation-user', () => ({
    getAutomationUserId: vi.fn().mockResolvedValue('auto-user'),
}));

import { prisma } from '@zenowethu/database';
import {
    buildConsentLink,
    buildCredoConsentLink,
    createDrrConsentRequest,
    formatConsentConsumerDisplayName,
    getDrrConsentByToken,
    getDrrConsentVerificationState,
    recordDrrConsent,
    DRR_CONSENT_TEXT,
    DRR_CONSENT_VERIFY_ERROR,
    verifyDrrConsentIdentity,
    type RecordConsentResult,
} from './consent-service';

type ConsentFailure = RecordConsentResult & { status: number };

const drr = prisma.debtReviewRemovalConsent as unknown as {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};
const caseComment = (prisma as unknown as { caseComment: { create: ReturnType<typeof vi.fn> } }).caseComment;
const caseModel = (prisma as unknown as { case: { update: ReturnType<typeof vi.fn> } }).case;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.zenowethu.co.za';
    process.env.CREDO_URL = 'https://crediva.zenowethu.co.za';
    caseComment.create.mockResolvedValue({});
    caseModel.update.mockResolvedValue({});
});

describe('buildConsentLink', () => {
    it('builds the public consent URL', () => {
        expect(buildConsentLink('tok123')).toBe('https://cases.zenowethu.co.za/consent/debt-review-removal/tok123');
    });
});

describe('buildCredoConsentLink', () => {
    it('builds the login-gated Credo consent URL', () => {
        expect(buildCredoConsentLink('tok123')).toBe('https://crediva.zenowethu.co.za/consent/tok123');
    });
});

describe('createDrrConsentRequest', () => {
    it('makes the Zenowethu file-handling acknowledgement explicit', () => {
        expect(DRR_CONSENT_TEXT).toContain('Zenowethu Debt Management is the debt counsellor authorised to work on my file');
        expect(DRR_CONSENT_TEXT).toContain('creates a clear record that Zenowethu Debt Management is handling my file');
    });

    it('reuses an existing un-expired PENDING request', async () => {
        drr.findFirst.mockResolvedValue({ id: 'c1', token: 'existing', expiresAt: new Date(Date.now() + 1e6) });
        const r = await createDrrConsentRequest({ caseId: 'case1' });
        expect(r.token).toBe('existing');
        expect(drr.create).not.toHaveBeenCalled();
    });

    it('creates a new request (with consent-text snapshot) when none exists', async () => {
        drr.findFirst.mockResolvedValue(null);
        drr.create.mockResolvedValue({ id: 'c2', token: 'newtok', expiresAt: new Date(Date.now() + 1e6) });
        const r = await createDrrConsentRequest({ caseId: 'case1', clientId: 'cl1' });
        expect(r.token).toBe('newtok');
        expect(r.link).toContain('/consent/debt-review-removal/newtok');
        expect(drr.create.mock.calls[0][0].data.consentText).toBe(DRR_CONSENT_TEXT);
    });
});

describe('getDrrConsentByToken', () => {
    it('returns a sanitised view (display name + file number only)', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'PENDING', expiresAt: new Date(Date.now() + 1e6),
            consentText: 'OLD PENDING TEXT', consentedAt: null,
            case: { fileNumber: 'ZDM-1' }, client: { firstName: 'Thabo', lastName: 'Mokoena' },
        });
        const v = await getDrrConsentByToken('t');
        expect(v?.consumerFirstName).toBe('Thabo Mokoena');
        expect(v?.consumerDisplayName).toBe('Thabo Mokoena');
        expect(v?.fileNumber).toBe('ZDM-1');
        expect(v?.expired).toBe(false);
        expect(v?.consentText).toBe(DRR_CONSENT_TEXT);
    });

    it('keeps historical text for already-consented records', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'CONSENTED', expiresAt: new Date(Date.now() + 1e6),
            consentText: 'TEXT ALREADY AGREED TO', consentedAt: new Date(),
            case: { fileNumber: 'ZDM-1' }, client: { firstName: 'Thabo', lastName: 'Mokoena' },
        });
        const v = await getDrrConsentByToken('t');
        expect(v?.consentText).toBe('TEXT ALREADY AGREED TO');
    });

    it('returns null for an unknown token', async () => {
        drr.findUnique.mockResolvedValue(null);
        expect(await getDrrConsentByToken('nope')).toBeNull();
    });
});

describe('getDrrConsentVerificationState', () => {
    it('returns only a verification-required response for a valid token', async () => {
        drr.findUnique.mockResolvedValue({ token: 't' });
        await expect(getDrrConsentVerificationState('t')).resolves.toEqual({
            requiresVerification: true,
            token: 't',
        });
    });

    it('returns null for an unknown token', async () => {
        drr.findUnique.mockResolvedValue(null);
        await expect(getDrrConsentVerificationState('nope')).resolves.toBeNull();
    });
});

describe('verifyDrrConsentIdentity', () => {
    it('unlocks the consent view when the token and ID number match', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'PENDING', expiresAt: new Date(Date.now() + 1e6),
            consentText: 'OLD PENDING TEXT', consentedAt: null,
            case: { fileNumber: 'ZDM-1' },
            client: { firstName: 'Thabo', lastName: 'Mokoena', idNumber: '8001015009087' },
        });

        const result = await verifyDrrConsentIdentity({ token: 't', idNumber: '8001015009087' });

        expect(result.ok).toBe(true);
        expect(result.view?.consumerDisplayName).toBe('Thabo Mokoena');
        expect(result.view?.fileNumber).toBe('ZDM-1');
        expect(result.view?.consentText).toBe(DRR_CONSENT_TEXT);
    });

    it('rejects another client ID number with a generic verification error', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'PENDING', expiresAt: new Date(Date.now() + 1e6),
            consentText: null, consentedAt: null,
            case: { fileNumber: 'ZDM-1' },
            client: { firstName: 'Thabo', lastName: 'Mokoena', idNumber: '8001015009087' },
        });

        const result = await verifyDrrConsentIdentity({ token: 't', idNumber: '9901015009087' });

        expect(result).toEqual({ ok: false, error: DRR_CONSENT_VERIFY_ERROR, status: 403 });
    });

    it('returns 404 for an unknown token', async () => {
        drr.findUnique.mockResolvedValue(null);
        const result = await verifyDrrConsentIdentity({ token: 'nope', idNumber: '8001015009087' });
        expect(result.ok).toBe(false);
        expect((result as ConsentFailure).status).toBe(404);
    });

    it('does not unlock an expired pending consent', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'PENDING', expiresAt: new Date(Date.now() - 1e6),
            consentText: null, consentedAt: null,
            case: { fileNumber: 'ZDM-1' },
            client: { firstName: 'Thabo', lastName: 'Mokoena', idNumber: '8001015009087' },
        });

        const result = await verifyDrrConsentIdentity({ token: 't', idNumber: '8001015009087' });

        expect(result.ok).toBe(false);
        expect((result as ConsentFailure).status).toBe(410);
    });

    it('does not unlock a cancelled consent', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'CANCELLED', expiresAt: new Date(Date.now() + 1e6),
            consentText: null, consentedAt: null,
            case: { fileNumber: 'ZDM-1' },
            client: { firstName: 'Thabo', lastName: 'Mokoena', idNumber: '8001015009087' },
        });

        const result = await verifyDrrConsentIdentity({ token: 't', idNumber: '8001015009087' });

        expect(result.ok).toBe(false);
        expect((result as ConsentFailure).status).toBe(410);
    });
});

describe('formatConsentConsumerDisplayName', () => {
    it('uses first given name plus surname when firstName contains multiple given names', () => {
        expect(formatConsentConsumerDisplayName({ firstName: 'NOFDA MMUSHO', lastName: 'MOKGOSHI' }))
            .toBe('NOFDA MOKGOSHI');
    });

    it('falls back to first given name when surname is missing', () => {
        expect(formatConsentConsumerDisplayName({ firstName: 'NOFDA MMUSHO', lastName: null })).toBe('NOFDA');
    });
});

describe('recordDrrConsent', () => {
    it('records consent, captures audit info, and fires the hook (sets triggeredAt)', async () => {
        drr.findUnique
            .mockResolvedValueOnce({
                id: 'c1', token: 't', status: 'PENDING', caseId: 'case1',
                expiresAt: new Date(Date.now() + 1e6),
                client: { idNumber: '8001015009087' },
            }) // recordDrrConsent lookup
            .mockResolvedValueOnce({ id: 'c1', caseId: 'case1', case: { fileNumber: 'ZDM-1' }, client: null, consumer: null }); // hook lookup
        drr.update.mockResolvedValue({ id: 'c1', caseId: 'case1' });

        const r = await recordDrrConsent({
            token: 't',
            ipAddress: '1.2.3.4',
            userAgent: 'UA',
            verifiedIdNumber: '8001015009087',
        });
        expect(r).toEqual({ ok: true, alreadyConsented: false, caseId: 'case1' });

        const consentUpdate = drr.update.mock.calls.find(c => c[0].data.status === 'CONSENTED');
        expect(consentUpdate?.[0].data.consentText).toBe(DRR_CONSENT_TEXT);
        expect(consentUpdate?.[0].data.ipAddress).toBe('1.2.3.4');
        const triggerUpdate = drr.update.mock.calls.find(c => c[0].data.triggeredAt);
        expect(triggerUpdate).toBeTruthy();
        // Consent is recorded on the case timeline
        expect(caseComment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ caseId: 'case1', activityType: 'DRR_CONSENT_RECEIVED' }),
            }),
        );
    });

    it('advances the case from Ready to Consent → Consent Received when the hook fires', async () => {
        drr.findUnique
            .mockResolvedValueOnce({
                id: 'c1', token: 't', status: 'PENDING', caseId: 'case1',
                expiresAt: new Date(Date.now() + 1e6),
                client: { idNumber: '8001015009087' },
            })
            .mockResolvedValueOnce({
                id: 'c1', caseId: 'case1',
                case: { fileNumber: 'ZDM-1', status: 'READY_TO_CONSENT' },
                client: null, consumer: null,
            });
        drr.update.mockResolvedValue({ id: 'c1', caseId: 'case1' });

        await recordDrrConsent({ token: 't', verifiedIdNumber: '8001015009087' });

        const statusUpdate = caseModel.update.mock.calls.find(c => c[0].data.status === 'CONSENT_RECEIVED');
        expect(statusUpdate).toBeTruthy();
        expect(statusUpdate?.[0].where).toEqual({ id: 'case1' });
        expect(statusUpdate?.[0].data.nextUpdate).toBeInstanceOf(Date);
    });

    it('does NOT clobber a manual staff status when consent arrives', async () => {
        drr.findUnique
            .mockResolvedValueOnce({
                id: 'c1', token: 't', status: 'PENDING', caseId: 'case1',
                expiresAt: new Date(Date.now() + 1e6),
                client: { idNumber: '8001015009087' },
            })
            .mockResolvedValueOnce({
                id: 'c1', caseId: 'case1',
                case: { fileNumber: 'ZDM-1', status: 'READY_COURT_DATE' },
                client: null, consumer: null,
            });
        drr.update.mockResolvedValue({ id: 'c1', caseId: 'case1' });

        await recordDrrConsent({ token: 't', verifiedIdNumber: '8001015009087' });

        expect(caseModel.update).not.toHaveBeenCalled();
    });

    it('stamps the Credo consumer id when the approval comes from the portal', async () => {
        drr.findUnique
            .mockResolvedValueOnce({ id: 'c1', token: 't', status: 'PENDING', caseId: 'case1', expiresAt: new Date(Date.now() + 1e6) })
            .mockResolvedValueOnce({ id: 'c1', caseId: 'case1', case: { fileNumber: 'ZDM-1' }, client: null, consumer: { idNumber: '8001015009087' } });
        drr.update.mockResolvedValue({ id: 'c1', caseId: 'case1' });

        await recordDrrConsent({ token: 't', consumerId: 'consumer-9' });

        const consentUpdate = drr.update.mock.calls.find(c => c[0].data.status === 'CONSENTED');
        expect(consentUpdate?.[0].data.consumerId).toBe('consumer-9');
    });

    it('is idempotent — already CONSENTED returns success without re-firing', async () => {
        drr.findUnique.mockResolvedValue({
            id: 'c1', token: 't', status: 'CONSENTED', caseId: 'case1',
            expiresAt: new Date(Date.now() + 1e6),
            client: { idNumber: '8001015009087' },
        });
        const r = await recordDrrConsent({ token: 't', verifiedIdNumber: '8001015009087' });
        expect(r).toEqual({ ok: true, alreadyConsented: true, caseId: 'case1' });
        expect(drr.update).not.toHaveBeenCalled();
    });

    it('rejects an expired token (and marks it EXPIRED)', async () => {
        drr.findUnique.mockResolvedValue({
            id: 'c1', token: 't', status: 'PENDING', caseId: 'case1',
            expiresAt: new Date(Date.now() - 1e6),
            client: { idNumber: '8001015009087' },
        });
        drr.update.mockResolvedValue({});
        const r = await recordDrrConsent({ token: 't', verifiedIdNumber: '8001015009087' });
        expect(r.ok).toBe(false);
        expect((r as ConsentFailure).status).toBe(410);
    });

    it('rejects a public approval when the ID number was not verified', async () => {
        drr.findUnique.mockResolvedValue({
            id: 'c1', token: 't', status: 'PENDING', caseId: 'case1',
            expiresAt: new Date(Date.now() + 1e6),
            client: { idNumber: '8001015009087' },
        });

        const r = await recordDrrConsent({ token: 't' });

        expect(r).toEqual({ ok: false, error: DRR_CONSENT_VERIFY_ERROR, status: 400 });
        expect(drr.update).not.toHaveBeenCalled();
    });

    it('rejects a public approval when the verified ID number does not match the token owner', async () => {
        drr.findUnique.mockResolvedValue({
            id: 'c1', token: 't', status: 'PENDING', caseId: 'case1',
            expiresAt: new Date(Date.now() + 1e6),
            client: { idNumber: '8001015009087' },
        });

        const r = await recordDrrConsent({ token: 't', verifiedIdNumber: '9901015009087' });

        expect(r).toEqual({ ok: false, error: DRR_CONSENT_VERIFY_ERROR, status: 403 });
        expect(drr.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
        drr.findUnique.mockResolvedValue(null);
        const r = await recordDrrConsent({ token: 'nope' });
        expect(r.ok).toBe(false);
        expect((r as ConsentFailure).status).toBe(404);
    });
});
