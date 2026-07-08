import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/dhs/consent-service', () => ({
    getDrrConsentVerificationState: vi.fn(),
    recordDrrConsent: vi.fn(),
    verifyDrrConsentIdentity: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/dhs/drr-readiness', () => ({
    runDrrDocumentReadiness: vi.fn().mockResolvedValue({}),
}));

import { GET, POST } from './route';
import { POST as VERIFY } from './verify/route';
import {
    getDrrConsentVerificationState,
    recordDrrConsent,
    verifyDrrConsentIdentity,
} from '@zenowethu/shared-lib/src/dhs/consent-service';

const verificationState = getDrrConsentVerificationState as unknown as ReturnType<typeof vi.fn>;
const verifyIdentity = verifyDrrConsentIdentity as unknown as ReturnType<typeof vi.fn>;
const record = recordDrrConsent as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ token: 'tok123' });
const request = (headers: Record<string, string> = {}, body?: unknown) =>
    new NextRequest('https://app.zenowethu.co.za/api/consent/debt-review-removal/tok123', {
        headers,
        ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('GET /api/consent/debt-review-removal/[token]', () => {
    it('returns only verification-required state before the ID number is checked', async () => {
        verificationState.mockResolvedValue({ requiresVerification: true, token: 'tok123' });

        const res = await GET(request(), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toEqual({ requiresVerification: true, token: 'tok123' });
        expect(json.consumerDisplayName).toBeUndefined();
        expect(json.fileNumber).toBeUndefined();
        expect(json.consentText).toBeUndefined();
    });

    it('returns 404 for an unknown token', async () => {
        verificationState.mockResolvedValue(null);
        const res = await GET(request(), { params });
        expect(res.status).toBe(404);
    });
});

describe('POST /api/consent/debt-review-removal/[token]/verify', () => {
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

    it('rejects another client ID number', async () => {
        verifyIdentity.mockResolvedValue({
            ok: false,
            error: 'We could not verify this consent link. Please check the ID number and try again.',
            status: 403,
        });

        const res = await VERIFY(request({}, { idNumber: '9901015009087' }), { params });
        const json = await res.json();

        expect(res.status).toBe(403);
        expect(json.error).toContain('could not verify');
    });
});

describe('POST /api/consent/debt-review-removal/[token]', () => {
    it('requires a valid ID number before recording approval', async () => {
        const res = await POST(request({}, { idNumber: '123' }), { params });
        expect(res.status).toBe(400);
        expect(record).not.toHaveBeenCalled();
    });

    it('records approval when the ID number matches the consent owner', async () => {
        verifyIdentity.mockResolvedValue({ ok: true, view: { token: 'tok123' } });
        record.mockResolvedValue({ ok: true, alreadyConsented: false, caseId: 'case1' });

        const res = await POST(request({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'UA' }, { idNumber: '8001015009087' }), { params });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(record).toHaveBeenCalledWith({
            token: 'tok123',
            ipAddress: '1.2.3.4',
            userAgent: 'UA',
            verifiedIdNumber: '8001015009087',
        });
    });

    it('rejects approval for a non-matching ID number', async () => {
        verifyIdentity.mockResolvedValue({
            ok: false,
            error: 'We could not verify this consent link. Please check the ID number and try again.',
            status: 403,
        });

        const res = await POST(request({}, { idNumber: '9901015009087' }), { params });
        expect(res.status).toBe(403);
        expect(record).not.toHaveBeenCalled();
    });
});
