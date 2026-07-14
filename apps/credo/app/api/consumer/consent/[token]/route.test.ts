import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

// The shared-lib root entry pulls in next-auth (Node/Edge-incompatible under
// Vitest), so it is always mocked in route tests — same pattern as the Cases app.
vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        debtReviewRemovalConsent: { findUnique: vi.fn(), update: vi.fn() },
        consumerAccount: { findUnique: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib/src/dhs/consent-service', () => ({
    recordDrrConsent: vi.fn(),
    getDrrConsentVerificationState: vi.fn(),
    verifyDrrConsentIdentity: vi.fn(),
    formatConsentConsumerDisplayName: (client: { firstName?: string | null; lastName?: string | null } | null | undefined) => {
        const firstGivenName = client?.firstName?.trim().split(/\s+/)[0] ?? '';
        const surname = client?.lastName?.trim() ?? '';
        return [firstGivenName, surname].filter(Boolean).join(' ') || null;
    },
    DRR_CONSENT_TEXT: 'CONSENT TEXT',
}));

import { GET, POST } from './route';
import { POST as VERIFY } from './verify/route';
import { prisma } from '@zenowethu/database';
import { auth } from '@/auth';
import {
    getDrrConsentVerificationState,
    recordDrrConsent,
    verifyDrrConsentIdentity,
} from '@zenowethu/shared-lib/src/dhs/consent-service';

const db = prisma as unknown as {
    debtReviewRemovalConsent: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
};
const record = recordDrrConsent as unknown as ReturnType<typeof vi.fn>;
const verificationState = getDrrConsentVerificationState as unknown as ReturnType<typeof vi.fn>;
const verifyIdentity = verifyDrrConsentIdentity as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ token: 'tok123' });
const request = (headers: Record<string, string> = {}, body?: unknown) =>
    new NextRequest('https://crediva.zenowethu.co.za/api/consumer/consent/tok123', {
        headers,
        ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });

const baseConsent = {
    id: 'consent1',
    token: 'tok123',
    status: 'PENDING',
    consumerId: null,
    consentText: 'CONSENT TEXT',
    consentedAt: null,
    expiresAt: new Date(Date.now() + 1e9),
    case: { id: 'case1', fileNumber: 'ZDM-2026-001' },
    client: { firstName: 'Sipho Themba', lastName: 'Dlamini', idNumber: '8001015009087' },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = ''; // don't attempt the cross-app trigger in tests
    db.debtReviewRemovalConsent.update.mockResolvedValue({});
});

describe('GET /api/consumer/consent/[token]', () => {
    it('returns only verification-required state when not signed in', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        verificationState.mockResolvedValue({ requiresVerification: true, token: 'tok123' });

        const res = await GET(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toEqual({ requiresVerification: true, token: 'tok123' });
        expect(json.fileNumber).toBeUndefined();
        expect(json.consumerDisplayName).toBeUndefined();
        expect(json.consentText).toBeUndefined();
    });

    it('returns the consent view and links the profile when the ID number matches', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({ ...baseConsent, consentText: 'OLD PENDING TEXT' });
        db.consumerAccount.findUnique.mockResolvedValue({ idNumber: '8001015009087' });

        const res = await GET(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.fileNumber).toBe('ZDM-2026-001');
        expect(json.consumerDisplayName).toBe('Sipho Dlamini');
        expect(json.consumerFirstName).toBe('Sipho Dlamini');
        expect(json.consentText).toBe('CONSENT TEXT');
        // Ownership established by ID number → consent linked to this profile
        expect(db.debtReviewRemovalConsent.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { consumerId: 'cons1' } }),
        );
    });

    it('keeps historical text once consent has already been recorded', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({
            ...baseConsent,
            status: 'CONSENTED',
            consumerId: 'cons1',
            consentText: 'TEXT ALREADY AGREED TO',
        });

        const res = await GET(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.consentText).toBe('TEXT ALREADY AGREED TO');
    });

    it('rejects a consumer whose ID number does not match', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'intruder' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue(baseConsent);
        db.consumerAccount.findUnique.mockResolvedValue({ idNumber: '9901015009087' });

        const res = await GET(request(), { params });
        expect(res.status).toBe(403);
    });

    it('rejects when the consent already belongs to another profile', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'intruder' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({ ...baseConsent, consumerId: 'cons1' });
        db.consumerAccount.findUnique.mockResolvedValue({ idNumber: '9901015009087' });

        const res = await GET(request(), { params });
        expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown token', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue(null);

        const res = await GET(request(), { params });
        expect(res.status).toBe(404);
    });
});

describe('POST /api/consumer/consent/[token]', () => {
    it('records the consent with the consumer id and audit headers', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({ ...baseConsent, consumerId: 'cons1' });
        record.mockResolvedValue({ ok: true, alreadyConsented: false, caseId: 'case1' });

        const res = await POST(request({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'UA' }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(record).toHaveBeenCalledWith({
            token: 'tok123',
            ipAddress: '1.2.3.4',
            userAgent: 'UA',
            consumerId: 'cons1',
            verifiedIdNumber: undefined,
        });
    });

    it('records signed-out approval only after matching ID verification', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        verifyIdentity.mockResolvedValue({ ok: true, view: { token: 'tok123' } });
        record.mockResolvedValue({ ok: true, alreadyConsented: false, caseId: 'case1' });

        const res = await POST(request({ 'user-agent': 'UA' }, { idNumber: '8001015009087' }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(verifyIdentity).toHaveBeenCalledWith({ token: 'tok123', idNumber: '8001015009087' });
        expect(record).toHaveBeenCalledWith({
            token: 'tok123',
            ipAddress: 'unknown',
            userAgent: 'UA',
            consumerId: undefined,
            verifiedIdNumber: '8001015009087',
        });
    });

    it('rejects signed-out approval for another client ID number', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        verifyIdentity.mockResolvedValue({
            ok: false,
            error: 'We could not verify this consent link. Please check the ID number and try again.',
            status: 403,
        });

        const res = await POST(request({}, { idNumber: '9901015009087' }), { params });
        const json = await res.json();

        expect(res.status).toBe(403);
        expect(json.error).toContain('could not verify');
        expect(record).not.toHaveBeenCalled();
    });

    it('propagates consent-service failures (e.g. expired)', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({ ...baseConsent, consumerId: 'cons1' });
        record.mockResolvedValue({ ok: false, error: 'This consent link has expired.', status: 410 });

        const res = await POST(request(), { params });
        expect(res.status).toBe(410);
    });

    it('returns 400 when signed-out approval omits a valid ID number', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(request({}, { idNumber: '123' }), { params });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/consumer/consent/[token]/verify', () => {
    it('returns the unlocked consent view for a matching ID number', async () => {
        verifyIdentity.mockResolvedValue({
            ok: true,
            view: {
                token: 'tok123',
                status: 'PENDING',
                expired: false,
                consumerDisplayName: 'Sipho Dlamini',
                consumerFirstName: 'Sipho Dlamini',
                fileNumber: 'ZDM-2026-001',
                consentText: 'CONSENT TEXT',
                consentedAt: null,
            },
        });

        const res = await VERIFY(request({}, { idNumber: '8001015009087' }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.consumerDisplayName).toBe('Sipho Dlamini');
        expect(json.fileNumber).toBe('ZDM-2026-001');
    });

    it('rejects a non-matching ID number', async () => {
        verifyIdentity.mockResolvedValue({
            ok: false,
            error: 'We could not verify this consent link. Please check the ID number and try again.',
            status: 403,
        });

        const res = await VERIFY(request({}, { idNumber: '9901015009087' }), { params });
        expect(res.status).toBe(403);
    });
});
