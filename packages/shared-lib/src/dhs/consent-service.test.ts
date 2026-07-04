import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        debtReviewRemovalConsent: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
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
    getDrrConsentByToken,
    recordDrrConsent,
    DRR_CONSENT_TEXT,
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

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.zenowethu.co.za';
    process.env.CREDO_URL = 'https://credo.zenowethu.co.za';
    caseComment.create.mockResolvedValue({});
});

describe('buildConsentLink', () => {
    it('builds the public consent URL', () => {
        expect(buildConsentLink('tok123')).toBe('https://cases.zenowethu.co.za/consent/debt-review-removal/tok123');
    });
});

describe('buildCredoConsentLink', () => {
    it('builds the login-gated Credo consent URL', () => {
        expect(buildCredoConsentLink('tok123')).toBe('https://credo.zenowethu.co.za/consent/tok123');
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
    it('returns a sanitised view (first name + file number only)', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'PENDING', expiresAt: new Date(Date.now() + 1e6),
            consentText: 'OLD PENDING TEXT', consentedAt: null,
            case: { fileNumber: 'ZDM-1' }, client: { firstName: 'Thabo' },
        });
        const v = await getDrrConsentByToken('t');
        expect(v?.consumerFirstName).toBe('Thabo');
        expect(v?.fileNumber).toBe('ZDM-1');
        expect(v?.expired).toBe(false);
        expect(v?.consentText).toBe(DRR_CONSENT_TEXT);
    });

    it('keeps historical text for already-consented records', async () => {
        drr.findUnique.mockResolvedValue({
            token: 't', status: 'CONSENTED', expiresAt: new Date(Date.now() + 1e6),
            consentText: 'TEXT ALREADY AGREED TO', consentedAt: new Date(),
            case: { fileNumber: 'ZDM-1' }, client: { firstName: 'Thabo' },
        });
        const v = await getDrrConsentByToken('t');
        expect(v?.consentText).toBe('TEXT ALREADY AGREED TO');
    });

    it('returns null for an unknown token', async () => {
        drr.findUnique.mockResolvedValue(null);
        expect(await getDrrConsentByToken('nope')).toBeNull();
    });
});

describe('recordDrrConsent', () => {
    it('records consent, captures audit info, and fires the hook (sets triggeredAt)', async () => {
        drr.findUnique
            .mockResolvedValueOnce({ id: 'c1', token: 't', status: 'PENDING', caseId: 'case1', expiresAt: new Date(Date.now() + 1e6) }) // recordDrrConsent lookup
            .mockResolvedValueOnce({ id: 'c1', caseId: 'case1', case: { fileNumber: 'ZDM-1' }, client: null, consumer: null }); // hook lookup
        drr.update.mockResolvedValue({ id: 'c1', caseId: 'case1' });

        const r = await recordDrrConsent({ token: 't', ipAddress: '1.2.3.4', userAgent: 'UA' });
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
        drr.findUnique.mockResolvedValue({ id: 'c1', token: 't', status: 'CONSENTED', caseId: 'case1', expiresAt: new Date(Date.now() + 1e6) });
        const r = await recordDrrConsent({ token: 't' });
        expect(r).toEqual({ ok: true, alreadyConsented: true, caseId: 'case1' });
        expect(drr.update).not.toHaveBeenCalled();
    });

    it('rejects an expired token (and marks it EXPIRED)', async () => {
        drr.findUnique.mockResolvedValue({ id: 'c1', token: 't', status: 'PENDING', caseId: 'case1', expiresAt: new Date(Date.now() - 1e6) });
        drr.update.mockResolvedValue({});
        const r = await recordDrrConsent({ token: 't' });
        expect(r.ok).toBe(false);
        expect((r as ConsentFailure).status).toBe(410);
    });

    it('rejects an unknown token', async () => {
        drr.findUnique.mockResolvedValue(null);
        const r = await recordDrrConsent({ token: 'nope' });
        expect(r.ok).toBe(false);
        expect((r as ConsentFailure).status).toBe(404);
    });
});
