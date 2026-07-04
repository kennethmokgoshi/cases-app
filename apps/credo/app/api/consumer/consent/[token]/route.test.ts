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
    DRR_CONSENT_TEXT: 'CONSENT TEXT',
}));

import { GET, POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@/auth';
import { recordDrrConsent } from '@zenowethu/shared-lib/src/dhs/consent-service';

const db = prisma as unknown as {
    debtReviewRemovalConsent: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
};
const record = recordDrrConsent as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ token: 'tok123' });
const request = (headers: Record<string, string> = {}) =>
    new NextRequest('https://credo.zenowethu.co.za/api/consumer/consent/tok123', { headers });

const baseConsent = {
    id: 'consent1',
    token: 'tok123',
    status: 'PENDING',
    consumerId: null,
    consentText: 'CONSENT TEXT',
    consentedAt: null,
    expiresAt: new Date(Date.now() + 1e9),
    case: { id: 'case1', fileNumber: 'ZDM-2026-001' },
    client: { firstName: 'Sipho', idNumber: '8001015009087' },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = ''; // don't attempt the cross-app trigger in tests
    db.debtReviewRemovalConsent.update.mockResolvedValue({});
});

describe('GET /api/consumer/consent/[token]', () => {
    it('returns 401 when not signed in', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await GET(request(), { params });
        expect(res.status).toBe(401);
    });

    it('returns the consent view and links the profile when the ID number matches', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({ ...baseConsent, consentText: 'OLD PENDING TEXT' });
        db.consumerAccount.findUnique.mockResolvedValue({ idNumber: '8001015009087' });

        const res = await GET(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.fileNumber).toBe('ZDM-2026-001');
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
        });
    });

    it('propagates consent-service failures (e.g. expired)', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'cons1' } } as never);
        db.debtReviewRemovalConsent.findUnique.mockResolvedValue({ ...baseConsent, consumerId: 'cons1' });
        record.mockResolvedValue({ ok: false, error: 'This consent link has expired.', status: 410 });

        const res = await POST(request(), { params });
        expect(res.status).toBe(410);
    });

    it('returns 401 when not signed in', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const res = await POST(request(), { params });
        expect(res.status).toBe(401);
    });
});
