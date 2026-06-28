import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        debtReviewRemovalConsent: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

import { prisma } from '@zenowethu/database';
import {
    buildConsentLink,
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

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://cases.zenowethu.co.za';
});

describe('buildConsentLink', () => {
    it('builds the public consent URL', () => {
        expect(buildConsentLink('tok123')).toBe('https://cases.zenowethu.co.za/consent/debt-review-removal/tok123');
    });
});

describe('createDrrConsentRequest', () => {
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
            consentText: DRR_CONSENT_TEXT, consentedAt: null,
            case: { fileNumber: 'ZDM-1' }, client: { firstName: 'Thabo' },
        });
        const v = await getDrrConsentByToken('t');
        expect(v?.consumerFirstName).toBe('Thabo');
        expect(v?.fileNumber).toBe('ZDM-1');
        expect(v?.expired).toBe(false);
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
        expect(consentUpdate?.[0].data.ipAddress).toBe('1.2.3.4');
        const triggerUpdate = drr.update.mock.calls.find(c => c[0].data.triggeredAt);
        expect(triggerUpdate).toBeTruthy();
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
